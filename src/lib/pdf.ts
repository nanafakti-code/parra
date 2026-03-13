import PDFDocument from "pdfkit";
import { supabaseAdmin } from "./supabase";

// Oscurece un hex multiplicando cada canal por `factor` (0–1)
function darkenHex(hex: string, factor: number): string {
    const c = hex.replace("#", "");
    return "#" + [0, 2, 4]
        .map(i => Math.round(parseInt(c.substring(i, i + 2), 16) * factor)
            .toString(16).padStart(2, "0"))
        .join("");
}

// Mezcla un hex con el fondo oscuro base (#07090d) usando `alpha` (0=fondo, 1=color)
function mixWithDark(hex: string, alpha: number): string {
    const c = hex.replace("#", "");
    const fg = [0, 2, 4].map(i => parseInt(c.substring(i, i + 2), 16));
    const bg = [7, 9, 13]; // #07090d
    return "#" + fg.map((v, i) => Math.round(bg[i] * (1 - alpha) + v * alpha)
        .toString(16).padStart(2, "0")).join("");
}

// Formatea un número con coma decimal y € al final: 79,99 €
const fmt = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20AC";

// Helper: bracket decorativo en esquina
const drawBracket = (doc: any, GREEN: string, x: number, y: number, size: number, flip: boolean) => {
    const s = size;
    const lw = 1.5;
    doc.lineWidth(lw).strokeColor(GREEN);
    if (!flip) {
        doc.moveTo(x, y + s).lineTo(x, y).lineTo(x + s, y).stroke();
    } else {
        doc.moveTo(x - s, y).lineTo(x, y).lineTo(x, y + s).stroke();
    }
};

// Helper: etiqueta de sección
const drawSectionLabel = (doc: any, GREEN: string, label: string, x: number, y: number) => {
    doc.font("Helvetica-Bold").fontSize(6.5).fillColor(GREEN)
        .text(label, x, y, { lineBreak: false, characterSpacing: 1.5 });
};

export async function generateInvoicePdf(order: any, userProfile?: any): Promise<Buffer> {
    // ── Configuración de marca y contacto desde admin ─────────────────
    let brandPrimary = "#39FF14";
    let brandName = "PARRA GK Gloves";
    let contactEmail = "info@parragkgloves.es";
    let contactPhone = "+34 91 000 00 00";
    let contactAddress = "Calle Mayor 42, 28001 Madrid";
    try {
        const { data: settingsRows } = await supabaseAdmin
            .from("site_settings").select("key, value").in("key", ["brand", "contact"]);
        const sm: Record<string, any> = {};
        (settingsRows || []).forEach((r: any) => { sm[r.key] = r.value; });
        const raw = sm.brand?.primary_color;
        if (raw && /^#[0-9a-fA-F]{6}$/.test(raw)) brandPrimary = raw.toUpperCase();
        if (sm.brand?.name) brandName = sm.brand.name;
        if (sm.contact?.email) contactEmail = sm.contact.email;
        if (sm.contact?.phone) contactPhone = sm.contact.phone;
        if (sm.contact?.address) contactAddress = sm.contact.address;
    } catch { /* mantener defaults */ }

    const items = (order.order_items || []).map((i: any) => ({
        name: i.products?.name || i.product_name || "Producto",
        quantity: Number(i.quantity) || 1,
        unit_price: parseFloat(i.unit_price) || 0,
        size: i.size || null,
        subtotal: (parseFloat(i.unit_price) || 0) * (Number(i.quantity) || 1),
    }));

    const orderNumber = order.order_number || `EG-${String(order.id).slice(-8).toUpperCase()}`;
    const orderDate = new Date(order.created_at || Date.now());
    const total = parseFloat(order.total) || 0;
    const shippingCost = parseFloat(order.shipping_cost) || 0;
    const subtotalProd = total - shippingCost;
    const baseImponible = subtotalProd / 1.21;
    const ivaAmount = subtotalProd - baseImponible;

    const customerName = order.shipping_name || userProfile?.full_name || "Cliente";
    const customerEmail = (order.email || userProfile?.email || "").toLowerCase();
    const customerPhone = order.shipping_phone || userProfile?.phone || "";
    const address = [order.shipping_street, order.shipping_city,
    order.shipping_postal_code, order.shipping_country || "España"]
        .filter(Boolean).join(", ");

    const statusLabels: Record<string, string> = {
        pending: "Pendiente", confirmed: "Confirmado", processing: "Procesando",
        shipped: "Enviado", delivered: "Entregado",
        cancelled: "Cancelado", refunded: "Reembolsado",
    };

    return new Promise((resolve, reject) => {
        let done = false;
        const finish = (buf?: Buffer, err?: unknown) => {
            if (done) return;
            done = true;
            if (err) reject(err); else resolve(buf!);
        };

        const doc = new PDFDocument({
            size: "A4", margin: 0, bufferPages: false,
            info: { Title: `Factura ${orderNumber}`, Author: "PARRA", Subject: "Factura de compra" },
        });

        const chunks: Buffer[] = [];
        doc.on("data", (c: Buffer) => chunks.push(c));
        doc.on("end", () => finish(Buffer.concat(chunks)));
        doc.on("error", (e: unknown) => finish(undefined, e));

        // ── Dimensiones ──────────────────────────────────────────────────
        const W = 595.28;
        const H = 841.89;
        const M = 44;
        const CW = W - M * 2;

        // ── Paleta futurista ─────────────────────────────────────────────
        const BG = "#07090d";   // fondo ultra oscuro
        const BLACK = "#0d0f14";   // negro panel
        const CARD = "#111520";   // tarjetas
        const CARD2 = "#0e1119";   // filas alternas
        const GREEN  = brandPrimary;                    // color acento principal (admin)
        const GREEND = darkenHex(brandPrimary, 0.62);   // variante oscura
        const GREENG = darkenHex(brandPrimary, 0.42);   // variante más oscura
        const GREENX = mixWithDark(brandPrimary, 0.14); // fondo muy oscuro tintado
        const WHITE = "#f0f4f8";
        const GRAY = "#6b7280";
        const LGRAY = "#9ca3af";
        const BORDER = "#1e2433";
        const ACCENT = "#0f1929";   // acento azulado oscuro

        const bracket = (x: number, y: number, size: number, flip: boolean) => drawBracket(doc, GREEN, x, y, size, flip);
        const sectionLabel = (label: string, x: number, y: number) => drawSectionLabel(doc, GREEN, label, x, y);

        // ── FONDO BASE ────────────────────────────────────────────────────
        doc.rect(0, 0, W, H).fill(BG);

        // ── HEADER ────────────────────────────────────────────────────────
        const HH = 130;
        doc.rect(0, 0, W, HH).fill(BLACK);
        doc.save()
            .moveTo(0, HH - 20).lineTo(W * 0.55, HH - 20).lineTo(W * 0.55 + 32, HH)
            .lineTo(0, HH).fill(ACCENT);
        doc.restore();
        doc.rect(0, HH - 2, W, 2).fill(GREEN);
        doc.rect(0, HH, W, 6).fill(GREENX);

        doc.font("Helvetica-Bold").fontSize(38).fillColor(WHITE)
            .text("PARRA", M, 28, { lineBreak: false, characterSpacing: 4 });
        doc.rect(M, 74, 3, 14).fill(GREEN);
        doc.font("Helvetica").fontSize(7.5).fillColor(LGRAY)
            .text("GOALKEEPER GLOVES", M + 10, 78, { lineBreak: false, characterSpacing: 2 });

        const badgeW = 130; const badgeH = 32; const badgeX = W - M - badgeW; const badgeY = 26;
        doc.rect(badgeX, badgeY, badgeW, badgeH).fill(GREENX);
        doc.rect(badgeX, badgeY, badgeW, badgeH).stroke(GREEN);
        doc.rect(badgeX, badgeY + badgeH - 2, badgeW, 2).fill(GREEN);
        doc.font("Helvetica-Bold").fontSize(16).fillColor(GREEN)
            .text("FACTURA", badgeX, badgeY + 8, { width: badgeW, align: "center", lineBreak: false, characterSpacing: 3 });

        doc.font("Helvetica").fontSize(8).fillColor(GRAY)
            .text("N\u00BA DE DOCUMENTO", badgeX, badgeY + badgeH + 8, { width: badgeW, align: "center", lineBreak: false, characterSpacing: 1 });
        doc.font("Helvetica-Bold").fontSize(10).fillColor(LGRAY)
            .text(orderNumber, badgeX, badgeY + badgeH + 20, { width: badgeW, align: "center", lineBreak: false });

        // ── BANDA DE ESTADO ───────────────────────────────────────────────
        const statusVal = (statusLabels[order.status] || order.status).toUpperCase();
        const SY = HH + 10;
        const SH = 34;
        doc.rect(M, SY, CW, SH).fill(CARD);
        doc.rect(M, SY, 3, SH).fill(GREEN);
        bracket(M + 3, SY + 5, 8, false);
        bracket(M + CW, SY + 5, 8, true);

        const colW3 = CW / 3;
        const metaRows = [
            { lbl: "FECHA DE EMISIÓN", val: orderDate.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" }) },
            { lbl: "N\u00BA PEDIDO", val: orderNumber },
            { lbl: "ESTADO", val: statusVal },
        ];
        metaRows.forEach((r, i) => {
            const x = M + 3 + colW3 * i + (i === 0 ? 14 : 10);
            doc.font("Helvetica").fontSize(6.5).fillColor(GRAY)
                .text(r.lbl, x, SY + 7, { lineBreak: false, characterSpacing: 1 });
            doc.font("Helvetica-Bold").fontSize(9).fillColor(i === 2 ? GREEN : WHITE)
                .text(r.val, x, SY + 19, { lineBreak: false });
            if (i < 2) {
                doc.lineWidth(0.5).strokeColor(BORDER)
                    .moveTo(M + 3 + colW3 * (i + 1), SY + 8)
                    .lineTo(M + 3 + colW3 * (i + 1), SY + SH - 8).stroke();
            }
        });

        // ── EMISOR / RECEPTOR ─────────────────────────────────────────────
        const IY = SY + SH + 14;
        const IH = 100;
        const HW = (CW - 10) / 2;
        const GAP = 10;

        // Card emisor
        doc.rect(M, IY, HW, IH).fill(CARD);
        doc.rect(M, IY, 3, IH).fill(GREEN);
        doc.rect(M + 3, IY, HW - 3, 1).fill(BORDER);
        bracket(M + 3, IY + 4, 10, false);
        bracket(M + HW, IY + 4, 10, true);
        bracket(M + 3, IY + IH - 14, 10, false);
        bracket(M + HW, IY + IH - 14, 10, true);
        sectionLabel("// EMISOR", M + 16, IY + 9);
        doc.rect(M + 16, IY + 19, 30, 1).fill(GREEND);

        const emisor = [
            ["Helvetica-Bold", 10, WHITE, brandName],
            ["Helvetica", 7.5, LGRAY, "CIF: B-12345678"],
            ["Helvetica", 7.5, LGRAY, contactAddress],
            ["Helvetica", 7.5, GRAY, contactEmail],
            ["Helvetica", 7.5, GRAY, contactPhone],
        ] as const;
        let ey = IY + 25;
        emisor.forEach(([f, s, c, t]) => {
            doc.font(f).fontSize(Number(s)).fillColor(c).text(t, M + 16, ey, { lineBreak: false });
            ey += Number(s) + 3.5;
        });

        // Card receptor
        const RX = M + HW + GAP;
        doc.rect(RX, IY, HW, IH).fill(CARD);
        doc.rect(RX, IY, 3, IH).fill(GREEN);
        bracket(RX + 3, IY + 4, 10, false);
        bracket(RX + HW, IY + 4, 10, true);
        bracket(RX + 3, IY + IH - 14, 10, false);
        bracket(RX + HW, IY + IH - 14, 10, true);
        sectionLabel("// CLIENTE", RX + 16, IY + 9);
        doc.rect(RX + 16, IY + 19, 30, 1).fill(GREEND);

        const receptor = [
            ["Helvetica-Bold", 10, WHITE, customerName],
            ...(customerEmail ? [["Helvetica", 7.5, LGRAY, customerEmail] as const] : []),
            ...(customerPhone ? [["Helvetica", 7.5, LGRAY, customerPhone] as const] : []),
            ...(address ? [["Helvetica", 7.5, GRAY, address] as const] : []),
        ];
        let ry = IY + 25;
        receptor.forEach(([f, s, c, t]) => {
            doc.font(f).fontSize(Number(s)).fillColor(c).text(t, RX + 16, ry, { width: HW - 28, lineBreak: false });
            ry += Number(s) + 3.5;
        });

        // ── TABLA DE PRODUCTOS ────────────────────────────────────────────
        const TY = IY + IH + 18;

        doc.rect(M, TY, CW, 28).fill(GREENX);
        doc.rect(M, TY, 3, 28).fill(GREEN);
        doc.rect(M, TY + 26, CW, 2).fill(GREEN);

        const cols = [
            { lbl: "DESCRIPCIÓN", x: M + 14, w: CW * 0.42 },
            { lbl: "TALLA", x: M + CW * 0.44, w: CW * 0.09 },
            { lbl: "CANT.", x: M + CW * 0.54, w: CW * 0.08 },
            { lbl: "P. UNITARIO", x: M + CW * 0.63, w: CW * 0.18 },
            { lbl: "IMPORTE", x: M + CW * 0.82, w: CW * 0.17 },
        ];
        cols.forEach((c) => {
            doc.font("Helvetica-Bold").fontSize(7).fillColor(GREEN)
                .text(c.lbl, c.x, TY + 9, { lineBreak: false, characterSpacing: 1 });
        });

        let rowY = TY + 28;
        const RH = 32;
        items.forEach((item: any, idx: number) => {
            const rowBg = idx % 2 === 0 ? CARD : CARD2;
            doc.rect(M, rowY, CW, RH).fill(rowBg);
            doc.rect(M, rowY, 3, RH).fill(idx % 2 === 0 ? GREEND : GREENG);
            doc.lineWidth(0.3).strokeColor(BORDER)
                .moveTo(M + 3, rowY + RH).lineTo(M + CW, rowY + RH).stroke();

            const cy = rowY + RH / 2 - 5;
            doc.circle(M + 10, cy + 5, 2).fill(GREEN);

            doc.font("Helvetica-Bold").fontSize(9).fillColor(WHITE)
                .text(item.name, cols[0].x, cy, { width: cols[0].w - 6, lineBreak: false });
            if (item.size) {
                doc.rect(cols[1].x - 2, cy - 1, 22, 14).fill(GREENX);
                doc.font("Helvetica-Bold").fontSize(8).fillColor(GREEN)
                    .text(item.size, cols[1].x, cy + 1, { lineBreak: false });
            } else {
                doc.font("Helvetica").fontSize(8).fillColor(GRAY)
                    .text("—", cols[1].x, cy, { lineBreak: false });
            }
            doc.font("Helvetica-Bold").fontSize(9).fillColor(WHITE)
                .text(String(item.quantity), cols[2].x, cy, { lineBreak: false });
            doc.font("Helvetica").fontSize(8.5).fillColor(LGRAY)
                .text(fmt(item.unit_price), cols[3].x, cy, { lineBreak: false });
            doc.font("Helvetica-Bold").fontSize(9).fillColor(GREEN)
                .text(fmt(item.subtotal), cols[4].x, cy, { align: "right", width: cols[4].w - 6, lineBreak: false });
            rowY += RH;
        });
        doc.rect(M, rowY, CW, 2).fill(BORDER);

        // ── TOTALES ───────────────────────────────────────────────────────
        const TX = M + CW * 0.52;
        const TW = CW * 0.48;
        const totRows: { lbl: string; val: string; accent?: boolean }[] = [
            { lbl: "Base imponible:", val: fmt(baseImponible) },
            { lbl: "IVA (21%):", val: fmt(ivaAmount) },
        ];
        if (shippingCost > 0) totRows.push({ lbl: "Gastos de envío:", val: fmt(shippingCost) });
        totRows.push({ lbl: "TOTAL A PAGAR", val: fmt(total), accent: true });

        const totalH = (totRows.length - 1) * 22 + 44 + 12;
        let tv = rowY + 16;

        doc.rect(TX, tv, TW, totalH).fill(CARD);
        doc.rect(TX, tv, TW, 2).fill(GREEND);
        doc.rect(TX, tv, 3, totalH).fill(GREEN);
        bracket(TX + 3, tv + 4, 8, false);
        bracket(TX + TW, tv + 4, 8, true);

        tv += 10;
        totRows.forEach((row) => {
            if (row.accent) {
                doc.rect(TX, tv - 2, TW, 38).fill(GREENX);
                doc.rect(TX, tv - 2, 3, 38).fill(GREEN);
                doc.rect(TX, tv - 2, TW, 1).fill(GREEND);
                doc.rect(TX, tv + 36, TW, 2).fill(GREEN);
                doc.font("Helvetica").fontSize(7).fillColor(GREEN)
                    .text("IMPORTE TOTAL  //", TX + 12, tv + 3, { lineBreak: false, characterSpacing: 1 });
                doc.font("Helvetica-Bold").fontSize(16).fillColor(GREEN)
                    .text(row.val, TX + 8, tv + 13, { lineBreak: false });
                tv += 42;
            } else {
                doc.lineWidth(0.3).strokeColor(BORDER)
                    .moveTo(TX + 12, tv + 18).lineTo(TX + TW - 12, tv + 18).stroke();
                doc.font("Helvetica").fontSize(8.5).fillColor(GRAY)
                    .text(row.lbl, TX + 12, tv + 4, { lineBreak: false });
                doc.font("Helvetica-Bold").fontSize(8.5).fillColor(WHITE)
                    .text(row.val, TX + 8, tv + 4, { align: "right", width: TW - 16, lineBreak: false });
                tv += 22;
            }
        });

        // ── NOTA LEGAL ────────────────────────────────────────────────────
        const NY = rowY + totalH + 32;
        doc.rect(M, NY, CW, 38).fill(CARD);
        doc.rect(M, NY, 3, 38).fill(GRAY);
        sectionLabel("// AVISO LEGAL", M + 12, NY + 8);
        doc.font("Helvetica").fontSize(7).fillColor(GRAY)
            .text(
                "Documento válido conforme al RD 1619/2012. IVA incluido en los precios. " +
                `${brandName} — CIF: B-12345678 — ${contactEmail}`,
                M + 12, NY + 21, { width: CW - 24, lineBreak: false }
            );

        // ── FOOTER ────────────────────────────────────────────────────────
        const FY = H - 50;
        doc.rect(0, FY, W, 50).fill(BLACK);
        doc.rect(0, FY, W, 2).fill(GREEN);
        doc.rect(0, FY + 2, W, 4).fill(GREENX);

        doc.lineWidth(0.4).strokeColor(BORDER);
        doc.moveTo(M, FY + 18).lineTo(W - M, FY + 18).stroke();

        doc.font("Helvetica-Bold").fontSize(9).fillColor(WHITE)
            .text(brandName.toUpperCase(), M, FY + 10, { lineBreak: false, characterSpacing: 2 });
        doc.font("Helvetica").fontSize(7).fillColor(GRAY)
            .text(`www.parragkgloves.es  ·  ${contactEmail}  ·  ${contactPhone}`, M, FY + 24, { lineBreak: false });
        doc.font("Helvetica").fontSize(7).fillColor(GRAY)
            .text(`Generado el ${orderDate.toLocaleDateString("es-ES")}  ·  ${orderNumber}`, 0, FY + 24,
                { align: "right", width: W - M, lineBreak: false });

        doc.font("Helvetica").fontSize(6.5).fillColor(GREEND)
            .text("DOCUMENTO FISCAL VERIFICADO", 0, FY + 36,
                { align: "right", width: W - M, lineBreak: false, characterSpacing: 1 });

        doc.end();
    });
}
