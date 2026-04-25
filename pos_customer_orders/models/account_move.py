from odoo import fields, models


class AccountMove(models.Model):
    _inherit = "account.move"

    is_customer_order = fields.Boolean(string="Es encargo TPV")
    customer_order_ref = fields.Char(string="Referencia encargo")
    customer_order_total = fields.Float(string="Total encargo")
    customer_order_paid = fields.Float(string="Pagado encargo")
    customer_order_pending = fields.Float(string="Pendiente encargo")
    customer_order_lines_json = fields.Text(string="Líneas encargo JSON")