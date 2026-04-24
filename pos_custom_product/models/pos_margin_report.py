from odoo import fields, models, tools


class PosMarginReport(models.Model):
    _name = "pos.margin.report"
    _description = "Informe de márgenes TPV"
    _auto = False
    _order = "date_order desc"

    date_order = fields.Datetime(string="Fecha")
    product_id = fields.Many2one("product.product", string="Producto")
    product_name = fields.Char(string="Producto vendido")
    qty = fields.Float(string="Cantidad")
    total_sales = fields.Float(string="Ventas con IVA")
    total_cost = fields.Float(string="Coste")
    total_margin = fields.Float(string="Margen")
    order_id = fields.Many2one("pos.order", string="Pedido TPV")

    def init(self):
        tools.drop_view_if_exists(self.env.cr, self._table)
        self.env.cr.execute("""
            CREATE OR REPLACE VIEW pos_margin_report AS (
                SELECT
                    l.id AS id,
                    o.date_order AS date_order,
                    l.product_id AS product_id,
                    l.full_product_name AS product_name,
                    l.qty AS qty,
                    l.price_subtotal_incl AS total_sales,
                    COALESCE(NULLIF(l.custom_cost_price, 0), 0) * l.qty AS total_cost,
                    l.price_subtotal_incl - (COALESCE(NULLIF(l.custom_cost_price, 0), 0) * l.qty) AS total_margin,
                    o.id AS order_id
                FROM pos_order_line l
                JOIN pos_order o ON o.id = l.order_id
                WHERE o.state IN ('paid', 'done', 'invoiced')
            )
        """)