from odoo import models, fields, api
from odoo.exceptions import UserError


class PosCustomerOrder(models.Model):
    _name = "pos.customer.order"
    _description = "Encargos TPV"
    _order = "create_date desc"

    name = fields.Char(string="Referencia", default="Nuevo", required=True)

    partner_id = fields.Many2one("res.partner", string="Cliente", required=True)
    line_ids = fields.One2many(
        "pos.customer.order.line",
        "order_id",
        string="Líneas",
    )

    note = fields.Text(string="Nota")
    expected_date = fields.Date(string="Fecha prevista")

    total_amount = fields.Float(string="Total")
    paid_amount = fields.Float(string="Pagado")

    pending_amount = fields.Float(
        string="Pendiente",
        compute="_compute_pending",
        store=True,
    )

    state = fields.Selection(
        [
            ("draft", "Pendiente"),
            ("received", "Mercancía recibida"),
            ("done", "Entregado"),
            ("cancel", "Cancelado"),
        ],
        default="draft",
    )

    def action_mark_received(self):
        for rec in self:
            rec.state = "received"

    def action_mark_done(self):
        for rec in self:
            rec.state = "done"

    def action_cancel(self):
        for rec in self:
            rec.state = "cancel"

    def action_back_to_draft(self):
        for rec in self:
            rec.state = "draft"

    @api.depends("total_amount", "paid_amount")
    def _compute_pending(self):
        for rec in self:
            rec.pending_amount = round(rec.total_amount - rec.paid_amount, 2)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get("name", "Nuevo") == "Nuevo":
                vals["name"] = (
                    self.env["ir.sequence"].next_by_code("pos.customer.order")
                    or "ENC/0001"
                )
        return super().create(vals_list)

    @api.model
    def create_from_pos(self, data):
        partner_id = data.get("partner_id")
        lines = data.get("lines") or []
        paid_amount = round(float(data.get("paid_amount") or 0), 2)
        note = data.get("note")
        expected_date = data.get("expected_date") or False
        total_amount = round(float(data.get("total_amount") or 0), 2)

        if not partner_id:
            raise UserError("Debe seleccionar un cliente.")

        if not lines:
            raise UserError("No hay líneas en el ticket.")

        if total_amount <= 0:
            raise UserError("El total del encargo debe ser mayor que 0.")

        if paid_amount <= 0:
            raise UserError("El anticipo debe ser mayor que 0.")

        if paid_amount > total_amount:
            raise UserError("El anticipo no puede superar el total del encargo.")

        order = self.create({
            "partner_id": int(partner_id),
            "note": note,
            "expected_date": expected_date,
            "total_amount": total_amount,
            "paid_amount": paid_amount,
            "line_ids": [
                (0, 0, {
                    "product_id": int(line.get("product_id")) if line.get("product_id") else False,
                    "description": line.get("description"),
                    "qty": float(line.get("qty") or 0),
                    "price_unit": float(line.get("price_unit") or 0),
                    "price_subtotal_incl": round(float(line.get("price_subtotal_incl") or 0), 2),
                })
                for line in lines
            ],
        })

        product = self.env["product.product"].search([
            ("default_code", "=", "ANTICIPO")
        ], limit=1)

        if not product:
            raise UserError("No existe el producto con referencia ANTICIPO.")

        return {
            "id": order.id,
            "name": order.name,
            "total_amount": round(order.total_amount, 2),
            "paid_amount": round(order.paid_amount, 2),
            "pending_amount": round(order.pending_amount, 2),
            "product_id": product.id,
        }


class PosCustomerOrderLine(models.Model):
    _name = "pos.customer.order.line"
    _description = "Líneas de encargo TPV"

    order_id = fields.Many2one(
        "pos.customer.order",
        string="Encargo",
        required=True,
        ondelete="cascade",
    )

    product_id = fields.Many2one("product.product", string="Producto")
    description = fields.Char(string="Descripción")
    qty = fields.Float(string="Cantidad")
    price_unit = fields.Float(string="Precio unitario")
    price_subtotal_incl = fields.Float(string="Subtotal")