from odoo import api, fields, models
from odoo.exceptions import UserError


class StockQuickEntry(models.Model):
    _name = "stock.quick.entry"
    _description = "Entrada rápida de stock"
    _order = "create_date desc"

    product_id = fields.Many2one("product.product", string="Producto", required=True)
    barcode = fields.Char(related="product_id.barcode", string="Código de barras", readonly=True)

    qty = fields.Float(string="Cantidad comprada", required=True, default=1.0)

    old_cost = fields.Float(string="Coste anterior", readonly=True)
    new_cost = fields.Float(string="Nuevo coste", required=True)

    old_price = fields.Float(string="Venta anterior", readonly=True)
    new_price = fields.Float(string="Nuevo precio venta", required=True)

    applied = fields.Boolean(string="Aplicado", default=False, readonly=True)

    @api.onchange("product_id")
    def _onchange_product_id(self):
        for rec in self:
            if rec.product_id:
                rec.old_cost = rec.product_id.standard_price
                rec.new_cost = rec.product_id.standard_price
                rec.old_price = rec.product_id.list_price
                rec.new_price = rec.product_id.list_price

    def action_apply(self):
        stock_location = self.env.ref("stock.stock_location_stock")

        for rec in self:
            if rec.applied:
                raise UserError("Esta línea ya está aplicada.")

            if rec.qty <= 0:
                raise UserError("La cantidad debe ser mayor que 0.")

            product = rec.product_id

            self.env["stock.quant"]._update_available_quantity(
                product,
                stock_location,
                rec.qty,
            )

            product.standard_price = rec.new_cost
            product.list_price = rec.new_price

            rec.applied = True

        return True