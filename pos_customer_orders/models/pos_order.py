from odoo import fields, models


class PosOrder(models.Model):
    _inherit = "pos.order"

    customer_order_id = fields.Many2one(
        "pos.customer.order",
        string="Encargo TPV",
        ondelete="set null",
    )

    is_customer_order = fields.Boolean(string="Es encargo")
    customer_order_ref = fields.Char(string="Referencia encargo")
    customer_order_total = fields.Float(string="Total encargo")
    customer_order_paid = fields.Float(string="Pagado encargo")
    customer_order_pending = fields.Float(string="Pendiente encargo")
    customer_order_lines_json = fields.Text(string="Líneas encargo JSON")

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

    @classmethod
    def _load_pos_data_fields(cls, config_id):
        fields_list = super()._load_pos_data_fields(config_id)

        extra_fields = [
            "customer_order_id",
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

    def _mark_customer_orders_done(self):
        customer_orders = self.mapped("customer_order_id").filtered(
            lambda order: order.state not in ("done", "cancel")
        )

        if customer_orders:
            customer_orders.action_mark_done()

    @classmethod
    def create_from_ui(cls, orders, draft=False):
        result = super().create_from_ui(orders, draft=draft)

        pos_order_ids = []

        for item in result:
            if isinstance(item, dict) and item.get("id"):
                pos_order_ids.append(item["id"])
            elif isinstance(item, int):
                pos_order_ids.append(item)

        if pos_order_ids:
            cls.env["pos.order"].browse(pos_order_ids)._mark_customer_orders_done()

        return result

    def write(self, vals):
        result = super().write(vals)

        if "customer_order_id" in vals or "state" in vals:
            self._mark_customer_orders_done()

        return result