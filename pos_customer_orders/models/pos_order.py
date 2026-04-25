from odoo import fields, models


class PosOrder(models.Model):
    _inherit = "pos.order"

    is_customer_order = fields.Boolean(string="Es encargo")
    customer_order_ref = fields.Char(string="Referencia encargo")
    customer_order_total = fields.Float(string="Total encargo")
    customer_order_paid = fields.Float(string="Pagado encargo")
    customer_order_pending = fields.Float(string="Pendiente encargo")
    customer_order_lines_json = fields.Text(string="Líneas encargo JSON")

    def _load_pos_data_fields(self, config_id):
        fields_list = super()._load_pos_data_fields(config_id)

        extra_fields = [
            "is_customer_order",
            "customer_order_ref",
            "customer_order_total",
            "customer_order_paid",
            "customer_order_pending",
            "customer_order_lines_json",
        ]

        for field in extra_fields:
            if field not in fields_list:
                fields_list.append(field)

        return fields_list

    def _create_invoice(self, move_vals):
        invoice = super()._create_invoice(move_vals)

        for order in self:
            if order.is_customer_order and order.account_move:
                order.account_move.write({
                    "is_customer_order": True,
                    "customer_order_ref": order.customer_order_ref,
                    "customer_order_total": order.customer_order_total,
                    "customer_order_paid": order.customer_order_paid,
                    "customer_order_pending": order.customer_order_pending,
                    "customer_order_lines_json": order.customer_order_lines_json,
                })

        return invoice