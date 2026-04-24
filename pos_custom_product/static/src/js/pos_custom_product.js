/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";

patch(PosStore.prototype, {
    async addLineToCurrentOrder(vals, opts = {}, configure = true) {
        const product = vals?.product_id || vals?.product_tmpl_id;
        const barcode = product?.barcode;

        if (barcode !== "CUSTOM") {
            return await super.addLineToCurrentOrder(vals, opts, configure);
        }

        const description = window.prompt("Descripción del producto personalizado:");
        if (!description || !description.trim()) {
            return;
        }

        const costRaw = window.prompt("Precio de coste:");
        const cost = parseFloat((costRaw || "").replace(",", "."));

        if (!cost || cost <= 0) {
            return;
        }

        const salePrice = Number((cost * 1.35).toFixed(2));

        const line = await super.addLineToCurrentOrder(
            vals,
            { ...opts, price: salePrice },
            false
        );

        const order = this.get_order();
        const selectedLine = order?.get_selected_orderline?.();

        if (selectedLine) {
            selectedLine.custom_description = description.trim();
            selectedLine.custom_cost_price = cost;

            if (typeof selectedLine.set_unit_price === "function") {
                selectedLine.set_unit_price(salePrice);
            }
        }

        return line;
    },
});