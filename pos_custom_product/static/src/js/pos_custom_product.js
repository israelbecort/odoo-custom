/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Component, useState } from "@odoo/owl";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { PosOrderline } from "@point_of_sale/app/models/pos_order_line";
import { Dialog } from "@web/core/dialog/dialog";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";

class AskCalculatePopup extends Component {
    static template = "pos_custom_product.AskCalculatePopup";
    static components = { Dialog };
    static props = ["close", "getPayload"];

    yes() {
        this.props.getPayload({ calculate: true });
        this.props.close();
    }

    no() {
        this.props.getPayload({ calculate: false });
        this.props.close();
    }

    cancel() {
        this.props.close();
    }
}

class CustomProductPopup extends Component {
    static template = "pos_custom_product.CustomProductPopup";
    static components = { Dialog };
    static props = ["close", "getPayload", "calculate"];

    setup() {
        this.state = useState({
            description: "",
            cost: "",
            salePrice: "",
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

        let finalPriceWithTax;

        if (this.props.calculate) {
            finalPriceWithTax = Number((cost * 1.35).toFixed(2));
        } else {
            finalPriceWithTax = parseFloat((this.state.salePrice || "").replace(",", "."));
            if (!finalPriceWithTax || finalPriceWithTax <= 0) {
                return;
            }
        }

        this.props.getPayload({
            description,
            cost,
            finalPriceWithTax,
        });

        this.props.close();
    }
}

patch(PosStore.prototype, {
    async addLineToCurrentOrder(vals, opts = {}, configure = true) {
        const product = vals?.product_id || vals?.product_tmpl_id;
        const barcode = product?.barcode;

        if (barcode !== "CUSTOM" || opts.from_customer_order) {
            return await super.addLineToCurrentOrder(vals, opts, configure);
        }

        const decision = await makeAwaitable(this.dialog, AskCalculatePopup, {});
        if (!decision) {
            return;
        }

        const payload = await makeAwaitable(this.dialog, CustomProductPopup, {
            calculate: decision.calculate,
        });

        if (!payload) {
            return;
        }

        const finalPriceWithTax = Number(payload.finalPriceWithTax.toFixed(2));
        const salePrice = Number((finalPriceWithTax / 1.21).toFixed(6));
        const margin = Number((finalPriceWithTax - payload.cost).toFixed(2));

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
            selectedLine.custom_margin = margin;

            console.log("CUSTOM LINE BEFORE SAVE", selectedLine);
            console.log("CUSTOM SERIALIZED", selectedLine.serializeForORM?.());

            selectedLine.full_product_name = payload.description;

            if (selectedLine.orderDisplayProductName) {
                selectedLine.orderDisplayProductName.name = payload.description;
            } else {
                selectedLine.orderDisplayProductName = {
                    name: payload.description,
                };
            }

            if (typeof selectedLine.set_unit_price === "function") {
                selectedLine.set_unit_price(salePrice);
            } else {
                selectedLine.price_unit = salePrice;
            }
        }

        return line;
    },
});

patch(PosOrderline.prototype, {
    setup(vals) {
        super.setup(vals);
        this.custom_description = vals.custom_description || "";
        this.custom_cost_price = vals.custom_cost_price || 0;
        this.custom_margin = vals.custom_margin || 0;
    },

    serializeForORM(opts = {}) {
        const data = super.serializeForORM(opts);

        data.custom_description = this.custom_description || "";
        data.custom_cost_price = this.custom_cost_price || 0;
        data.custom_margin = this.custom_margin || 0;

        return data;
    },
});