{
    "name": "Stock Quick Entry",
    "version": "19.0.1.0.0",
    "summary": "Entrada rápida de stock, coste y precio de venta",
    "depends": ["stock", "product"],
    "data": [
        "security/ir.model.access.csv",
        "views/stock_quick_entry_views.xml",
    ],
    "installable": True,
    "application": False,
    "license": "LGPL-3",
}