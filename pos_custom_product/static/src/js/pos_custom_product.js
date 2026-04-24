/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Component, useState } from "@odoo/owl";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { Dialog } from "@web/core/dialog/dialog";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";

class CustomProductPopup extends Component {
    static template = "pos_custom_product.CustomProductPopup";
    static components = { Dialog };
    static props = ["close", "getPayload"];

    setup() {
        this.state = useState({
            description: "",
            cost: "",
        });
    }

    cancel() {
        this.props.close();
    }

    confirm() {
        const description = this.state.description.trim();
        const cost = parseFloat((this.state.cost || "").replace(",", "."));

        if (!description || !cost || cost <= 0) {
            return;
        }

        this.props.getPayload({
            description,
            cost,
        });

        this.props.close();
    }
}

patch(PosStore.prototype, {
    async addLineToCurrentOrder(vals, opts = {}, configure = true) {
        const product = vals?.product_id || vals?.product_tmpl_id;
        const barcode = product?.barcode;

        if (barcode !== "CUSTOM") {
            return await super.addLineToCurrentOrder(vals, opts, configure);
        }

        const payload = await makeAwaitable(this.dialog, CustomProductPopup, {});

        if (!payload) {
            return;
        }

        // Queremos que coste * 1.35 sea el precio FINAL con IVA incluido.
        // Como Odoo aplica el IVA después, guardamos el precio base sin IVA.
        const finalPriceWithTax = Number((payload.cost * 1.35).toFixed(2));
        const salePrice = Number((finalPriceWithTax / 1.21).toFixed(6));

        const line = await super.addLineToCurrentOrder(
            vals,
            { ...opts, price: salePrice },
            false
        );

        const order = this.selectedOrder;
        const selectedLine = order?.get_selected_orderline?.() || order?.lines?.at?.(-1);

        if (selectedLine) {
            selectedLine.custom_description = payload.description;
            selectedLine.custom_cost_price = payload.cost;
        
            selectedLine.full_product_name = payload.description;
            selectedLine.customer_note = payload.description;
            selectedLine.note = payload.description;
        
            if (typeof selectedLine.set_unit_price === "function") {
                selectedLine.set_unit_price(salePrice);
            } else {
                selectedLine.price_unit = salePrice;
            }
        }

        return line;
    },
});