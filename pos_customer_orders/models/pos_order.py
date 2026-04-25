from odoo import fields, models


class PosOrder(models.Model):
    _inherit = "pos.order"

    is_customer_order = fields.Boolean(string="Es encargo")
    customer_order_ref = fields.Char(string="Referencia encargo")
    customer_order_total = fields.Float(string="Total encargo")
    customer_order_paid = fields.Float(string="Pagado encargo")
    customer_order_pending = fields.Float(string="Pendiente encargo")
    customer_order_lines_json = fields.Text(string="Líneas encargo JSON")