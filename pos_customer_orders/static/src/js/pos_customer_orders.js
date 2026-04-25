/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Component, useState } from "@odoo/owl";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { Dialog } from "@web/core/dialog/dialog";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { PartnerList } from "@point_of_sale/app/screens/partner_list/partner_list";
import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { TicketScreen } from "@point_of_sale/app/screens/ticket_screen/ticket_screen";

class CustomerOrderPopup extends Component {
    static template = "pos_customer_orders.CustomerOrderPopup";
    static components = { Dialog };
    static props = ["close", "getPayload", "partner", "selectPartner"];

    setup() {
        this.state = useState({
            paidAmount: "",
            expectedDate: "",
            note: "",
            partner: this.props.partner,
        });
    }

    cancel() {
        this.props.close();
    }

    async changePartner() {
        const selectedPartner = await this.props.selectPartner(this.state.partner);

        if (selectedPartner) {
            this.state.partner = selectedPartner;
        }
    }

    confirm() {
        const paidAmount = parseFloat((this.state.paidAmount || "").replace(",", "."));

        if (!paidAmount || paidAmount <= 0) {
            return;
        }

        this.props.getPayload({
            partner_id: this.state.partner.id,
            paid_amount: paidAmount,
            expected_date: this.state.expectedDate || false,
            note: this.state.note.trim(),
        });

        this.props.close();
    }
}

function getLineSubtotalIncl(line) {
    const qty = line.qty || 1;
    const priceUnit = line.price_unit || 0;

    const taxes = line.product_id?.taxes_id || [];
    const taxAmount = taxes.reduce((sum, tax) => {
        return sum + (tax.amount || 0);
    }, 0);

    return priceUnit * qty * (1 + taxAmount / 100);
}

patch(PosOrder.prototype, {
    setup(vals) {
        super.setup(vals);

        this.uiState = this.uiState || {};

        const linesJson = this.customer_order_lines_json || vals?.customer_order_lines_json;

        if (this.is_customer_order || vals?.is_customer_order) {
            console.log("LOADED CUSTOMER ORDER DATA", this.uiState.customer_order_data);
            let customerOrderLines = [];

            try {
                customerOrderLines = linesJson ? JSON.parse(linesJson) : [];
            } catch {
                customerOrderLines = [];
            }

            this.uiState.is_customer_order = true;
            this.uiState.customer_order_data = {
                name: this.customer_order_ref || vals?.customer_order_ref,
                total: Number(this.customer_order_total || vals?.customer_order_total || 0),
                paid: Number(this.customer_order_paid || vals?.customer_order_paid || 0),
                pending: Number(this.customer_order_pending || vals?.customer_order_pending || 0),
                lines: customerOrderLines,
            };
        }
    },

    serializeForORM(opts = {}) {
        const data = super.serializeForORM(opts);

        if (this.uiState?.is_customer_order && this.uiState?.customer_order_data) {
            data.is_customer_order = true;
            data.customer_order_ref = this.uiState.customer_order_data.name;
            data.customer_order_total = this.uiState.customer_order_data.total;
            data.customer_order_paid = this.uiState.customer_order_data.paid;
            data.customer_order_pending = this.uiState.customer_order_data.pending;
            data.customer_order_lines_json = JSON.stringify(
                this.uiState.customer_order_data.lines || []
            );
        }

        return data;
    },
});

patch(ControlButtons.prototype, {
    async clickCustomerOrder() {
        const order = this.pos.getOrder();

        if (!order || order.isEmpty()) {
            this.notification.add("Añada productos al ticket antes de crear un encargo.", {
                type: "warning",
            });
            return;
        }

        let partner = order.getPartner();

        if (!partner) {
            partner = await makeAwaitable(this.dialog, PartnerList, {
                partner: null,
            });

            if (!partner) {
                return;
            }

            order.setPartner(partner);
        }

        const payload = await makeAwaitable(this.dialog, CustomerOrderPopup, {
            partner,
            selectPartner: async (currentPartner) => {
                const selectedPartner = await makeAwaitable(this.dialog, PartnerList, {
                    partner: currentPartner,
                });

                if (selectedPartner) {
                    partner = selectedPartner;
                    order.setPartner(partner);
                }

                return partner;
            },
        });

        if (!payload) {
            return;
        }

        const lines = order.getOrderlines().map((line) => {
            const qty = line.qty || 1;
            const priceUnit = line.price_unit || 0;
            const subtotalIncl = Number(getLineSubtotalIncl(line).toFixed(2));

            return {
                product_id: line.product_id?.id,
                description: line.full_product_name || line.product_id?.display_name || "",
                qty: qty,
                price_unit: priceUnit,
                price_subtotal_incl: subtotalIncl,
            };
        });

        const totalAmount = Number(
            lines.reduce((sum, line) => sum + line.price_subtotal_incl, 0).toFixed(2)
        );

        if (payload.paid_amount > totalAmount) {
            this.notification.add("El anticipo no puede superar el total del encargo.", {
                type: "warning",
            });
            return;
        }

        const result = await this.env.services.orm.call(
            "pos.customer.order",
            "create_from_pos",
            [{
                partner_id: payload.partner_id,
                lines,
                total_amount: totalAmount,
                paid_amount: payload.paid_amount,
                expected_date: payload.expected_date,
                note: payload.note,
            }]
        );

        order.uiState.is_customer_order = true;
        order.uiState.customer_order_data = {
            name: result.name,
            total: Number(result.total_amount),
            paid: Number(result.paid_amount),
            pending: Number(result.pending_amount),
            lines: lines,
        };

        await this.pos.loadNewProducts([
            ["id", "=", result.product_id],
        ]);

        const product = this.pos.models["product.product"].get(result.product_id);

        if (!product) {
            this.notification.add("No se pudo cargar el producto ANTICIPO.", {
                type: "danger",
            });
            return;
        }

        for (const line of [...order.getOrderlines()]) {
            order.removeOrderline(line);
        }

        await this.pos.addLineToCurrentOrder(
            {
                product_id: product,
                product_tmpl_id: product.product_tmpl_id,
            },
            {
                price: payload.paid_amount,
            },
            false
        );

        const advanceLine = order.getSelectedOrderline();

        if (advanceLine) {
            if (typeof advanceLine.setUnitPrice === "function") {
                advanceLine.setUnitPrice(payload.paid_amount);
            } else if (typeof advanceLine.set_unit_price === "function") {
                advanceLine.set_unit_price(payload.paid_amount);
            } else {
                advanceLine.price_unit = payload.paid_amount;
            }

            advanceLine.full_product_name = `Anticipo ${result.name}`;

            if (advanceLine.orderDisplayProductName) {
                advanceLine.orderDisplayProductName.name = `Anticipo ${result.name}`;
            }
        }

        this.notification.add(`Encargo ${result.name} creado.`, {
            type: "success",
        });
    },
});

patch(TicketScreen.prototype, {
    async print(order) {
        if (order?.id) {
            const data = await this.env.services.orm.read(
                "pos.order",
                [order.id],
                [
                    "is_customer_order",
                    "customer_order_ref",
                    "customer_order_total",
                    "customer_order_paid",
                    "customer_order_pending",
                    "customer_order_lines_json",
                ]
            );

            const posOrder = data?.[0];

            if (posOrder?.is_customer_order) {
                let customerOrderLines = [];

                try {
                    customerOrderLines = posOrder.customer_order_lines_json
                        ? JSON.parse(posOrder.customer_order_lines_json)
                        : [];
                } catch {
                    customerOrderLines = [];
                }

                order.uiState = order.uiState || {};
                order.uiState.is_customer_order = true;
                order.uiState.customer_order_data = {
                    name: posOrder.customer_order_ref,
                    total: Number(posOrder.customer_order_total || 0),
                    paid: Number(posOrder.customer_order_paid || 0),
                    pending: Number(posOrder.customer_order_pending || 0),
                    lines: customerOrderLines,
                };
            }
        }

        await super.print(order);
    },
});