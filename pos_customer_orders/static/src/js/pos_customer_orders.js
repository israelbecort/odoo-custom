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
    static props = ["close", "getPayload"];

    setup() {
        this.state = useState({
            paidAmount: "",
            expectedDate: "",
            note: "",
        });
    }

    cancel() {
        this.props.close();
    }

    confirm() {
        const paidAmount = parseFloat((this.state.paidAmount || "").replace(",", "."));

        if (!paidAmount || paidAmount <= 0) {
            return;
        }

        this.props.getPayload({
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

        const payload = await makeAwaitable(this.dialog, CustomerOrderPopup, {});

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

    console.log("CUSTOM ORDER RAW LINES", order.getOrderlines());
    console.log("CUSTOM ORDER LINES", lines);
    console.log("CUSTOM ORDER TOTAL", totalAmount);
    console.log("CUSTOM ORDER PAID", payload.paid_amount);

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
                partner_id: partner.id,
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
            advanceLine.full_product_name = `Anticipo ${result.name}`;
            advanceLine.customer_note = `Encargo ${result.name} - Total: ${result.total_amount}€ - Pendiente: ${result.pending_amount}€`;

            if (advanceLine.orderDisplayProductName) {
                advanceLine.orderDisplayProductName.name = `Anticipo ${result.name}`;
            }
        }

        this.notification.add(`Encargo ${result.name} creado.`, {
            type: "success",
        });
    },
});