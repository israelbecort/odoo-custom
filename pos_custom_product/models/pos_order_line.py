from odoo import fields, models


class PosOrderLine(models.Model):
    _inherit = "pos.order.line"

    custom_description = fields.Char(string="Custom Description")
    custom_cost_price = fields.Float(string="Custom Cost Price")

    def _order_line_fields(self, line, session_id=None):
        vals = super()._order_line_fields(line, session_id=session_id)
        vals[2]["custom_description"] = line.get("custom_description", "")
        vals[2]["custom_cost_price"] = line.get("custom_cost_price", 0.0)
        return vals