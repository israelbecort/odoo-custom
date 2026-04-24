/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Component, useState } from "@odoo/owl";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { Dialog } from "@web/core/dialog/dialog";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";

class CustomProductPopup extends Component {
    static template = "pos_custom_product.CustomProductPopup";
    static components = { Dialog };
    static props = ["close"];

    setup() {
        this.state = useState({
            description: "",
            cost: "",
        });
    }

    cancel() {
        this.props.close({ confirmed: false });
    }

    confirm() {
        const cost = parseFloat((this.state.cost || "").replace(",", "."));

        if (!this.state.description.trim() || !cost || cost <= 0) {
            return;
        }

        this.props.close({
            confirmed: true,
            payload: {
                description: this.state.description.trim(),
                cost,
            },
        });
    }
}

patch(PosStore.prototype, {
    async addLineToCurrentOrder(vals, opts = {}, configure = true) {
        const product = vals?.product_id || vals?.product_tmpl_id;
        const barcode = product?.barcode;

        if (barcode !== "CUSTOM") {
            return await super.addLineToCurrentOrder(vals, opts, configure);
        }

        const result = await makeAwaitable(this.dialog, CustomProductPopup, {});

        if (!result || !result.confirmed) {
            return;
        }

        const cost = result.payload.cost;
        const salePrice = Number((cost * 1.35).toFixed(2));

        const line = await super.addLineToCurrentOrder(
            vals,
            { ...opts, price: salePrice },
            false
        );

        const order = this.get_order();
        const selectedLine = order?.get_selected_orderline?.();

        if (selectedLine) {
            selectedLine.custom_description = result.payload.description;
            selectedLine.custom_cost_price = cost;

            if (typeof selectedLine.set_unit_price === "function") {
                selectedLine.set_unit_price(salePrice);
            }
        }

        return line;
    },
});