/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";

patch(PosStore.prototype, {
    async addProductToCurrentOrder(product, options = {}) {
        console.log("HOOK addProductToCurrentOrder", product);

        if (product.barcode !== "CUSTOM") {
            return super.addProductToCurrentOrder(product, options);
        }

        alert("CUSTOM detectado");

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

        return super.addProductToCurrentOrder(product, {
            ...options,
            price: salePrice,
        });
    },
});