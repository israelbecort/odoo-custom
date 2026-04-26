/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Component, useState } from "@odoo/owl";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { Dialog } from "@web/core/dialog/dialog";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { PartnerList } from "@point_of_sale/app/screens/partner_list/partner_list";
import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { TicketScreen } from "@point_of_sale/app/screens/ticket_screen/ticket_screen";
import { registry } from "@web/core/registry";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";

function getLineSubtotalIncl(line) {
    const qty = line.qty || 1;
    const priceUnit = line.price_unit || 0;
    const taxes = line.product_id?.taxes_id || [];
    const taxAmount = taxes.reduce((sum, tax) => sum + (tax.amount || 0), 0);
    return priceUnit * qty * (1 + taxAmount / 100);
}

class CustomerOrderPopup extends Component {
    static template = "pos_customer_orders.CustomerOrderPopup";
    static components = { Dialog };
    static props = ["close", "getPayload", "partner", "selectPartner", "lines"];

    setup() {
        this.state = useState({
            paidAmount: "",
            expectedDate: "",
            note: "",
            partner: this.props.partner,
            selectedLineUuids: {},
        });

        for (const line of this.props.lines || []) {
            this.state.selectedLineUuids[line.uuid] = false;
        }
    }

    get selectedLines() {
        return (this.props.lines || []).filter((line) => this.state.selectedLineUuids[line.uuid]);
    }

    get selectedTotal() {
        return Number(
            this.selectedLines.reduce((sum, line) => sum + line.price_subtotal_incl, 0).toFixed(2)
        );
    }

    toggleLine(uuid) {
        this.state.selectedLineUuids[uuid] = !this.state.selectedLineUuids[uuid];
    }

    cancel() {
        this.props.close();
    }

    async changePartner() {
        const selectedPartner = await this.props.selectPartner(this.state.partner);
        if (selectedPartner) {
            this.state.partner = selectedPartner;
        }
    }

    confirm() {
        const paidAmount = parseFloat((this.state.paidAmount || "").replace(",", "."));

        if (!this.state.partner?.id) {
            return;
        }

        if (!this.selectedLines.length) {
            return;
        }

        if (!paidAmount || paidAmount <= 0) {
            return;
        }

        if (paidAmount > this.selectedTotal) {
            return;
        }

        this.props.getPayload({
            partner_id: this.state.partner.id,
            paid_amount: paidAmount,
            expected_date: this.state.expectedDate || false,
            note: this.state.note.trim(),
            selected_line_uuids: this.selectedLines.map((line) => line.uuid),
        });

        this.props.close();
    }
}

patch(PosOrder.prototype, {
    setup(vals) {
        super.setup(vals);

        this.uiState = this.uiState || {};
        const linesJson = this.customer_order_lines_json || vals?.customer_order_lines_json;

        if (this.is_customer_order || vals?.is_customer_order) {
            let customerOrderLines = [];

            try {
                customerOrderLines = linesJson ? JSON.parse(linesJson) : [];
            } catch {
                customerOrderLines = [];
            }

            this.uiState.is_customer_order = true;
            this.uiState.customer_order_data = {
                name: this.customer_order_ref || vals?.customer_order_ref,
                total: Number(this.customer_order_total || vals?.customer_order_total || 0),
                paid: Number(this.customer_order_paid || vals?.customer_order_paid || 0),
                pending: Number(this.customer_order_pending || vals?.customer_order_pending || 0),
                lines: customerOrderLines,
            };
        }
    },

    serializeForORM(opts = {}) {
        const data = super.serializeForORM(opts);

        if (this.uiState?.is_customer_order && this.uiState?.customer_order_data) {
            data.is_customer_order = true;
            data.customer_order_ref = this.uiState.customer_order_data.name;
            data.customer_order_total = this.uiState.customer_order_data.total;
            data.customer_order_paid = this.uiState.customer_order_data.paid;
            data.customer_order_pending = this.uiState.customer_order_data.pending;
            data.customer_order_lines_json = JSON.stringify(
                this.uiState.customer_order_data.lines || []
            );
        }

        return data;
    },
});

patch(ControlButtons.prototype, {
    async clickCustomerOrder() {
        const order = this.pos.getOrder();

        if (!order || order.isEmpty()) {
            this.notification.add("Añada productos al ticket antes de crear un encargo.", {
                type: "warning",
            });
            return;
        }

        let partner = order.getPartner();

        if (!partner) {
            partner = await makeAwaitable(this.dialog, PartnerList, {
                partner: null,
            });

            if (!partner) {
                return;
            }

            // Importante: NO hacemos order.setPartner(partner) aquí.
            // Odoo recalcula precios al asignar cliente y puede poner CUSTOM a 0,00.
        }

        const currentLines = order.getOrderlines().map((line) => {
            const qty = line.qty || 1;
            const priceUnit = line.price_unit || 0;
            const subtotalIncl = Number(getLineSubtotalIncl(line).toFixed(2));

            return {
                uuid: line.uuid,
                originalLine: line,
                product_id: line.product_id?.id,
                description: line.full_product_name || line.product_id?.display_name || "",
                qty,
                price_unit: priceUnit,
                price_subtotal_incl: subtotalIncl,
            };
        });

        const payload = await makeAwaitable(this.dialog, CustomerOrderPopup, {
            partner,
            lines: currentLines,
            selectPartner: async (currentPartner) => {
                const selectedPartner = await makeAwaitable(this.dialog, PartnerList, {
                    partner: currentPartner,
                });

                if (selectedPartner) {
                    partner = selectedPartner;
                    // Importante: NO hacemos order.setPartner(partner) aquí.
                }

                return partner;
            },
        });

        if (!payload) {
            return;
        }

        const selectedLines = currentLines.filter((line) =>
            payload.selected_line_uuids.includes(line.uuid)
        );

        if (!selectedLines.length) {
            this.notification.add("Seleccione al menos una línea para el encargo.", {
                type: "warning",
            });
            return;
        }

        const lines = selectedLines.map((line) => ({
            product_id: line.product_id,
            description: line.description,
            qty: line.qty,
            price_unit: line.price_unit,
            price_subtotal_incl: line.price_subtotal_incl,
        }));

        const totalAmount = Number(
            lines.reduce((sum, line) => sum + line.price_subtotal_incl, 0).toFixed(2)
        );

        if (payload.paid_amount > totalAmount) {
            this.notification.add("El anticipo no puede superar el total del encargo.", {
                type: "warning",
            });
            return;
        }

        const result = await this.env.services.orm.call(
            "pos.customer.order",
            "create_from_pos",
            [
                {
                    partner_id: payload.partner_id,
                    lines,
                    total_amount: totalAmount,
                    paid_amount: payload.paid_amount,
                    expected_date: payload.expected_date,
                    note: payload.note,
                },
            ]
        );

        // Ahora sí asignamos el cliente, cuando ya hemos leído/importado las líneas.
        // Si Odoo recalcula precios, ya no afecta al cálculo del encargo.
        if (partner) {
            order.setPartner(partner);
        }

        order.uiState.is_customer_order = true;
        order.uiState.customer_order_data = {
            name: result.name,
            total: Number(result.total_amount),
            paid: Number(result.paid_amount),
            pending: Number(result.pending_amount),
            lines,
        };

        await this.pos.loadNewProducts([["id", "=", result.product_id]]);

        const product = this.pos.models["product.product"].get(result.product_id);

        if (!product) {
            this.notification.add("No se pudo cargar el producto ANTICIPO.", {
                type: "danger",
            });
            return;
        }

        for (const line of selectedLines) {
            order.removeOrderline(line.originalLine);
        }

        await this.pos.addLineToCurrentOrder(
            {
                product_id: product,
                product_tmpl_id: product.product_tmpl_id,
            },
            {
                price: payload.paid_amount,
            },
            false
        );

        const advanceLine = order.getSelectedOrderline();

        if (advanceLine) {
            if (typeof advanceLine.setUnitPrice === "function") {
                advanceLine.setUnitPrice(payload.paid_amount);
            } else if (typeof advanceLine.set_unit_price === "function") {
                advanceLine.set_unit_price(payload.paid_amount);
            } else {
                advanceLine.price_unit = payload.paid_amount;
            }

            advanceLine.full_product_name = `Anticipo ${result.name}`;

            if (advanceLine.orderDisplayProductName) {
                advanceLine.orderDisplayProductName.name = `Anticipo ${result.name}`;
            }
        }

        this.notification.add(`Encargo ${result.name} creado.`, {
            type: "success",
        });
    },
});

patch(TicketScreen.prototype, {
    async print(order) {
        if (order?.id) {
            const data = await this.env.services.orm.read(
                "pos.order",
                [order.id],
                [
                    "is_customer_order",
                    "customer_order_ref",
                    "customer_order_total",
                    "customer_order_paid",
                    "customer_order_pending",
                    "customer_order_lines_json",
                ]
            );

            const posOrder = data?.[0];

            if (posOrder?.is_customer_order) {
                let customerOrderLines = [];

                try {
                    customerOrderLines = posOrder.customer_order_lines_json
                        ? JSON.parse(posOrder.customer_order_lines_json)
                        : [];
                } catch {
                    customerOrderLines = [];
                }

                order.uiState = order.uiState || {};
                order.uiState.is_customer_order = true;
                order.uiState.customer_order_data = {
                    name: posOrder.customer_order_ref,
                    total: Number(posOrder.customer_order_total || 0),
                    paid: Number(posOrder.customer_order_paid || 0),
                    pending: Number(posOrder.customer_order_pending || 0),
                    lines: customerOrderLines,
                };
            }
        }

        await super.print(order);
    },
});

class CustomerOrdersScreen extends Component {
    static template = "pos_customer_orders.CustomerOrdersScreen";

    setup() {
        this.pos = usePos();
    
        this.state = useState({
            orders: [],
            filter: "active",
            search: "",
        });
    
        this.loadOrders();
    }

    async loadOrders() {
        let domain = [];

        if (this.state.filter === "active") {
            domain = [["state", "in", ["draft", "received"]]];
        } else if (this.state.filter !== "all") {
            domain = [["state", "=", this.state.filter]];
        }

        const orders = await this.env.services.orm.searchRead(
            "pos.customer.order",
            domain,
            [
                "name",
                "partner_id",
                "expected_date",
                "total_amount",
                "paid_amount",
                "pending_amount",
                "state",
            ],
            {
                order: "create_date desc",
                limit: 100,
            }
        );

        this.state.orders = orders;
    }

    get filteredOrders() {
        const search = this.state.search.toLowerCase().trim();

        if (!search) {
            return this.state.orders;
        }

        return this.state.orders.filter((order) => {
            const partnerName = order.partner_id?.[1] || "";
            return (
                order.name.toLowerCase().includes(search) ||
                partnerName.toLowerCase().includes(search)
            );
        });
    }

    stateLabel(state) {
        return {
            draft: "Pendiente",
            received: "Mercancía recibida",
            done: "Entregado",
            cancel: "Cancelado",
        }[state] || state;
    }

    async markReceived(order) {
        await this.env.services.orm.call("pos.customer.order", "action_mark_received", [[order.id]]);
        await this.loadOrders();
    }

    async chargePending(order) {
        console.log("COBRAR PENDIENTE", order);
        const currentOrder = this.pos.getOrder();
    
        if (currentOrder && !currentOrder.isEmpty()) {
            this.env.services.notification.add(
                "Abra un ticket nuevo antes de cobrar un encargo.",
                { type: "warning" }
            );
            return;
        }
    
        const customerOrders = await this.env.services.orm.read(
            "pos.customer.order",
            [order.id],
            [
                "name",
                "partner_id",
                "total_amount",
                "paid_amount",
                "pending_amount",
                "line_ids",
            ]
        );
    
        const customerOrder = customerOrders?.[0];
    
        if (!customerOrder) {
            return;
        }
    
        const lines = await this.env.services.orm.searchRead(
            "pos.customer.order.line",
            [["order_id", "=", order.id]],
            [
                "product_id",
                "description",
                "qty",
                "price_unit",
                "price_subtotal_incl",
            ]
        );
    
        const advanceProducts = await this.env.services.orm.searchRead(
            "product.product",
            [["default_code", "=", "ANTICIPO"]],
            ["id"],
            { limit: 1 }
        );
    
        const advanceProductId = advanceProducts?.[0]?.id;
    
        if (!advanceProductId) {
            this.env.services.notification.add(
                "No existe el producto con referencia ANTICIPO.",
                { type: "danger" }
            );
            return;
        }
    
        const productIds = [
            ...lines.map((line) => line.product_id?.[0]).filter(Boolean),
            advanceProductId,
        ];
    
        await this.pos.loadNewProducts([
            ["id", "in", productIds],
        ]);
    
        if (customerOrder.partner_id?.[0]) {
            const partners = await this.env.services.orm.searchRead(
                "res.partner",
                [["id", "=", customerOrder.partner_id[0]]],
                ["id", "name"],
                { limit: 1 }
            );
    
            if (partners?.[0]) {
                const partner = this.pos.models["res.partner"].get(partners[0].id);
                if (partner) {
                    currentOrder.setPartner(partner);
                }
            }
        }
    
        for (const line of lines) {
            const productId = line.product_id?.[0];
            const product = this.pos.models["product.product"].get(productId);
    
            if (!product) {
                continue;
            }
    
            await this.pos.addLineToCurrentOrder(
                {
                    product_id: product,
                    product_tmpl_id: product.product_tmpl_id,
                },
                {
                    price: line.price_unit,
                    from_customer_order: true,
                },
                false
            );
    
            const advanceLine = currentOrder.getSelectedOrderline();

            if (advanceLine) {
                const advancePrice = -Math.abs(Number(customerOrder.paid_amount || 0));

                if (typeof advanceLine.set_unit_price === "function") {
                    advanceLine.set_unit_price(advancePrice);
                } else if (typeof advanceLine.setUnitPrice === "function") {
                    advanceLine.setUnitPrice(advancePrice);
                } else {
                    advanceLine.price_unit = advancePrice;
                }

                advanceLine.price_type = "manual";

                advanceLine.full_product_name = `Anticipo ${customerOrder.name}`;

                if (advanceLine.orderDisplayProductName) {
                    advanceLine.orderDisplayProductName.name = `Anticipo ${customerOrder.name}`;
                }
            }
        }
    
        const advanceProduct = this.pos.models["product.product"].get(advanceProductId);
    
        await this.pos.addLineToCurrentOrder(
            {
                product_id: advanceProduct,
                product_tmpl_id: advanceProduct.product_tmpl_id,
            },
            {
                price: -Math.abs(customerOrder.paid_amount),
            },
            false
        );
    
        const advanceLine = currentOrder.getSelectedOrderline();
    
        if (advanceLine) {
            advanceLine.full_product_name = `Anticipo ${customerOrder.name}`;
    
            if (advanceLine.orderDisplayProductName) {
                advanceLine.orderDisplayProductName.name = `Anticipo ${customerOrder.name}`;
            }
        }
    
        currentOrder.uiState.is_customer_order = true;
        currentOrder.uiState.customer_order_data = {
            name: customerOrder.name,
            total: Number(customerOrder.total_amount || 0),
            paid: Number(customerOrder.paid_amount || 0),
            pending: Number(customerOrder.pending_amount || 0),
            lines,
        };
    
        this.pos.navigate("ProductScreen");
    
        this.env.services.notification.add(
            `Ticket preparado para cobrar ${customerOrder.name}.`,
            { type: "success" }
        );
    }

    async markDone(order) {
        await this.env.services.orm.call("pos.customer.order", "action_mark_done", [[order.id]]);
        await this.loadOrders();
    }

    async cancelOrder(order) {
        await this.env.services.orm.call("pos.customer.order", "action_cancel", [[order.id]]);
        await this.loadOrders();
    }

    back() {
        this.pos.navigate("ProductScreen");
    }
}

registry.category("pos_pages").add("CustomerOrdersScreen", {
    name: "CustomerOrdersScreen",
    route: "/pos/customer-orders",
    component: CustomerOrdersScreen,
});