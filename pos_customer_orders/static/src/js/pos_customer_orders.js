/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Component, useState } from "@odoo/owl";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { Dialog } from "@web/core/dialog/dialog";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";

class CustomerOrderPopup extends Component {
    static template = "pos_customer_orders.CustomerOrderPopup";
    static components = { Dialog };
    static props = ["close", "getPayload"];

    setup() {
        this.state = useState({
            partnerName: "",
            phone: "",
            note: "",
            totalAmount: "",
            paidAmount: "",
        });
    }

    cancel() {
        this.props.close();
    }

    confirm() {
        const totalAmount = parseFloat((this.state.totalAmount || "").replace(",", "."));
        const paidAmount = parseFloat((this.state.paidAmount || "").replace(",", "."));

        if (!this.state.partnerName.trim() || !this.state.note.trim()) {
            return;
        }

        if (!totalAmount || totalAmount <= 0) {
            return;
        }

        if (!paidAmount || paidAmount <= 0 || paidAmount > totalAmount) {
            return;
        }

        this.props.getPayload({
            partner_name: this.state.partnerName.trim(),
            phone: this.state.phone.trim(),
            note: this.state.note.trim(),
            total_amount: totalAmount,
            paid_amount: paidAmount,
        });

        this.props.close();
    }
}

patch(ControlButtons.prototype, {
    async clickCustomerOrder() {
        const payload = await makeAwaitable(this.dialog, CustomerOrderPopup, {});

        if (!payload) {
            return;
        }

        const result = await this.env.services.orm.call(
            "pos.customer.order",
            "create_from_pos",
            [payload]
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
                price: payload.paid_amount,
            },
            false
        );

        const order = this.pos.getOrder();
        const line = order?.getSelectedOrderline();

        if (line) {
            line.full_product_name = `Anticipo ${result.name}`;
            line.customer_note = payload.note;
            line.note = `Encargo ${result.name} - Total: ${payload.total_amount}€ - Pendiente: ${result.pending_amount}€`;

            if (line.orderDisplayProductName) {
                line.orderDisplayProductName.name = `Anticipo ${result.name}`;
            }
        }

        this.notification.add(`Encargo ${result.name} creado.`, {
            type: "success",
        });
    },
});