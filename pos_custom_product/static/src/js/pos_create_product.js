/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Component, useState } from "@odoo/owl";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { Dialog } from "@web/core/dialog/dialog";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";

class AskCreateProductPopup extends Component {
    static template = "pos_custom_product.AskCreateProductPopup";
    static components = { Dialog };
    static props = ["close", "getPayload", "barcode"];

    yes() {
        this.props.getPayload({ create: true });
        this.props.close();
    }

    no() {
        this.props.close();
    }
}

class CreateProductFromBarcodePopup extends Component {
    static template = "pos_custom_product.CreateProductFromBarcodePopup";
    static components = { Dialog };
    static props = ["close", "getPayload", "barcode", "categories"];

    setup() {
        this.state = useState({
            name: "",
            finalPrice: "",
            cost: "",
            posCategoryId: "",
            taxRate: "21",
        });
    }

    cancel() {
        this.props.close();
    }

    confirm() {
        const name = this.state.name.trim();
        const finalPrice = parseFloat((this.state.finalPrice || "").replace(",", "."));
        const cost = parseFloat((this.state.cost || "").replace(",", "."));
        const posCategoryId = parseInt(this.state.posCategoryId || 0);
        const taxRate = parseFloat(this.state.taxRate);

        if (!name || !finalPrice || finalPrice <= 0 || !cost || cost < 0 || !posCategoryId) {
            return;
        }

        this.props.getPayload({
            name,
            final_price: finalPrice,
            cost,
            pos_category_id: posCategoryId,
            tax_rate: taxRate,
        });

        this.props.close();
    }
}

patch(ProductScreen.prototype, {
    async _barcodeProductAction(code) {
        let product = await this._getProductByBarcode(code);

        if (!product) {
            this.sound.play("scan-error");

            const decision = await makeAwaitable(this.dialog, AskCreateProductPopup, {
                barcode: code.base_code,
            });

            if (!decision?.create) {
                this.barcodeReader.showNotFoundNotification(code);
                return;
            }

            const categories = this.pos.models["pos.category"]
                .filter((category) => category.id)
                .map((category) => ({
                    id: category.id,
                    name: category.name,
                }));

            const payload = await makeAwaitable(this.dialog, CreateProductFromBarcodePopup, {
                barcode: code.base_code,
                categories,
            });

            if (!payload) {
                return;
            }

            await this.env.services.orm.call(
                "product.template",
                "create_from_pos_barcode",
                [{
                    barcode: code.base_code,
                    ...payload,
                }]
            );

            await this.pos.loadNewProducts([
                ["product_variant_ids.barcode", "=", code.base_code],
            ]);

            product = this.pos.models["product.product"].getBy("barcode", code.base_code);

            if (!product) {
                this.barcodeReader.showNotFoundNotification(code);
                return;
            }
        }

        this.sound.play("beep");

        await this.pos.addLineToCurrentOrder(
            { product_id: product, product_tmpl_id: product.product_tmpl_id },
            { code },
            product.needToConfigure()
        );

        this.numberBuffer.reset();
        this.showOptionalProductPopupIfNeeded(product);
    },
});