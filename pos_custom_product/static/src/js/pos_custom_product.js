/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/store/pos_store";

patch(PosStore.prototype, {
    async addProductToCurrentOrder(product, options = {}) {
        if (product.barcode !== "CUSTOM") {
            return super.addProductToCurrentOrder(product, options);
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

        const result = await super.addProductToCurrentOrder(product, {
            ...options,
            price: salePrice,
        });

        const order = this.get_order();
        const line = order?.get_selected_orderline?.();
        if (!line) {
            return result;
        }

        line.custom_description = description.trim();
        line.custom_cost_price = cost;

        if (typeof line.set_unit_price === "function") {
            line.set_unit_price(salePrice);
        }

        return result;
    },
});