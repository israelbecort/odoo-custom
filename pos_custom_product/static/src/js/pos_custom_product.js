/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { useState } from "@odoo/owl";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { Dialog } from "@web/core/dialog/dialog";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";

class CustomProductPopup extends Dialog {
    static template = "pos_custom_product.CustomProductPopup";

    setup() {
        super.setup();
        this.state = useState({
            description: "",
            cost: "",
        });
    }

    cancel() {
        this.close({ confirmed: false });
    }

    confirm() {
        const cost = parseFloat(this.state.cost || 0);
        if (!this.state.description.trim() || cost <= 0) {
            return;
        }

        this.close({
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

        let product = vals?.product_id || vals?.product_tmpl_id;

        const barcode = product?.barcode;

        if (barcode !== "CUSTOM") {
            return await super.addLineToCurrentOrder(vals, opts, configure);
        }

        const result = await makeAwaitable(this.dialog, CustomProductPopup, {});

        if (!result || !result.confirmed) {
            return;
        }

        const cost = parseFloat(result.payload.cost);
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

            selectedLine.set_unit_price(salePrice);
        }

        return line;
    },
});