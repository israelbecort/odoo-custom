from odoo import models, fields


class PosOrderLine(models.Model):
    _inherit = "pos.order.line"

    custom_cost_price = fields.Float("Coste")
    custom_margin = fields.Float("Margen")