/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Component, useState } from "@odoo/owl";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
import { Orderline } from "@point_of_sale/app/store/models";
import { Dialog } from "@web/core/dialog/dialog";

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
        this.props.close({ confirmed: false, payload: null });
    }

    confirm() {
        const cost = parseFloat(this.state.cost || 0);
        if (!this.state.description.trim() || !cost || cost <= 0) {
            return;
        }
        this.props.close({
            confirmed: true,
            payload: {
                description: this.state.description.trim(),
                cost: cost,
            },
        });
    }
}

patch(PosStore.prototype, {
    async addProductToCurrentOrder(product, options = {}) {
        if (product.barcode !== "CUSTOM") {
            return super.addProductToCurrentOrder(product, options);
        }

        const result = await makeAwaitable(this.dialog, CustomProductPopup, {});

        if (!result || !result.confirmed) {
            return;
        }

        const cost = parseFloat(result.payload.cost);
        const salePrice = Number((cost * 1.35).toFixed(2));

        const order = this.get_order();
        if (!order) {
            return;
        }

        const line = this.models["pos.order.line"].create({
            order_id: order,
            product_id: product,
            price_unit: salePrice,
            qty: 1,
        });

        line.custom_description = result.payload.description;
        line.custom_cost_price = cost;

        line.set_unit_price(salePrice);
        order.add_orderline(line);

        if (typeof line.set_full_product_name === "function") {
            line.set_full_product_name(`${product.display_name} - ${result.payload.description}`);
        }

        return line;
    },
});

patch(Orderline.prototype, {
    export_as_JSON() {
        const json = super.export_as_JSON(...arguments);
        json.custom_description = this.custom_description || "";
        json.custom_cost_price = this.custom_cost_price || 0;
        return json;
    },

    init_from_JSON(json) {
        super.init_from_JSON(...arguments);
        this.custom_description = json.custom_description || "";
        this.custom_cost_price = json.custom_cost_price || 0;
    },

    getDisplayData() {
        const data = super.getDisplayData(...arguments);
        if (this.custom_description) {
            data.productName = `${data.productName} - ${this.custom_description}`;
        }
        return data;
    },
});