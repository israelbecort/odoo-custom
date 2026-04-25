from odoo import api, models
from odoo.exceptions import UserError


class ProductTemplate(models.Model):
    _inherit = "product.template"

    @api.model
    def create_from_pos_barcode(self, data):
        barcode = data.get("barcode")
        name = data.get("name")
        final_price = float(data.get("final_price") or 0)
        cost = float(data.get("cost") or 0)
        tax_rate = float(data.get("tax_rate") or 21)
        pos_category_id = data.get("pos_category_id")

        if not barcode:
            raise UserError("Falta el código de barras.")

        if not name:
            raise UserError("Falta el nombre del producto.")

        if final_price <= 0:
            raise UserError("El precio de venta debe ser mayor que 0.")

        existing = self.env["product.product"].search([("barcode", "=", barcode)], limit=1)
        if existing:
            return existing.id

        tax = self.env["account.tax"].search([
            ("type_tax_use", "=", "sale"),
            ("amount", "=", tax_rate),
            ("company_id", "in", [self.env.company.id, False]),
        ], limit=1)

        product_category = self.env.ref("product.product_category_all", raise_if_not_found=False)

        list_price_without_tax = final_price / (1 + tax_rate / 100)

        vals = {
            "name": name,
            "barcode": barcode,
            "list_price": list_price_without_tax,
            "standard_price": cost,
            "taxes_id": [(6, 0, tax.ids)] if tax else False,
            "categ_id": product_category.id if product_category else False,
        }

        if "available_in_pos" in self._fields:
            vals["available_in_pos"] = True

        if "pos_categ_ids" in self._fields and pos_category_id:
            vals["pos_categ_ids"] = [(6, 0, [int(pos_category_id)])]

        if "is_storable" in self._fields:
            vals["is_storable"] = True
        elif "detailed_type" in self._fields:
            vals["detailed_type"] = "product"
        elif "type" in self._fields:
            vals["type"] = "consu"

        template = self.create(vals)

        return template.product_variant_id.id