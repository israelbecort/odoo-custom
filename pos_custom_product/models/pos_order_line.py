from odoo import fields, models


class PosOrderLine(models.Model):
    _inherit = "pos.order.line"

    custom_description = fields.Char(string="Custom Description")
    custom_cost_price = fields.Float(string="Custom Cost Price")

    @classmethod
    def _load_pos_data_fields(cls, config):
        fields_list = super()._load_pos_data_fields(config)
        fields_list += ["custom_description", "custom_cost_price"]
        return fields_list

    @classmethod
    def _load_pos_data_domain(cls, data):
        return super()._load_pos_data_domain(data)

    def _export_for_ui(self, orderline):
        result = super()._export_for_ui(orderline)
        result["custom_description"] = orderline.custom_description
        result["custom_cost_price"] = orderline.custom_cost_price
        return result

    def _order_line_fields(self, line, session_id=None):
        vals = super()._order_line_fields(line, session_id=session_id)
        vals[2]["custom_description"] = line.get("custom_description", "")
        vals[2]["custom_cost_price"] = line.get("custom_cost_price", 0.0)
        return vals