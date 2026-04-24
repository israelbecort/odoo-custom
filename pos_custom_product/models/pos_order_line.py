from odoo import api, fields, models


class PosOrderLine(models.Model):
    _inherit = "pos.order.line"

    custom_description = fields.Char(string="Descripción personalizada")
    custom_cost_price = fields.Float(string="Coste personalizado")
    custom_margin = fields.Float(string="Margen personalizado")

    @api.model
    def _load_pos_data_fields(self, config_id):
        fields = super()._load_pos_data_fields(config_id)
        fields += [
            "custom_description",
            "custom_cost_price",
            "custom_margin",
        ]
        return fields

    def _order_line_fields(self, line, session_id=None):
        vals = super()._order_line_fields(line, session_id=session_id)
        vals[2]["custom_description"] = line.get("custom_description", "")
        vals[2]["custom_cost_price"] = line.get("custom_cost_price", 0.0)
        vals[2]["custom_margin"] = line.get("custom_margin", 0.0)
        return vals

    @api.model_create_multi
    def create(self, vals_list):
        lines = super().create(vals_list)

        for line in lines:
            if line.custom_cost_price:
                line.custom_margin = line.price_subtotal_incl - (
                    line.custom_cost_price * line.qty
                )

        return lines