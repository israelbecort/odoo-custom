/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Component, useState } from "@odoo/owl";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { Dialog } from "@web/core/dialog/dialog";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { PartnerList } from "@point_of_sale/app/screens/partner_list/partner_list";

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

        await this.pos.addLineToCurrentOrder(
            {
                product_id: product,
                product_tmpl_id: product.product_tmpl_id,
            },
            {
                price: -Number(result.pending_amount),
            },
            false
        );

        const advanceLine = order.getSelectedOrderline();

        if (advanceLine) {
            const pendingAmount = -Number(result.pending_amount);

            if (typeof advanceLine.setUnitPrice === "function") {
                advanceLine.setUnitPrice(pendingAmount);
            } else if (typeof advanceLine.set_unit_price === "function") {
                advanceLine.set_unit_price(pendingAmount);
            } else {
                advanceLine.price_unit = pendingAmount;
            }

            advanceLine.full_product_name = `Pendiente ${result.name}`;

            if (advanceLine.orderDisplayProductName) {
                advanceLine.orderDisplayProductName.name = `Pendiente ${result.name}`;
            }
        }

        this.notification.add(`Encargo ${result.name} creado.`, {
            type: "success",
        });
    },
});