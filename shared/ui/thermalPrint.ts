import type { Order } from "../types/realtime";
import { mxn, orderLabel, time } from "./components";

export function printThermalTicket(order: Order) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  const itemsHtml = order.items
    .map(
      (line) => `
      <div style="margin: 4px 0;">
        <div style="display: flex; justify-content: space-between; font-weight: bold;">
          <span>${line.quantity} × ${line.name}</span>
          <span>${mxn(line.lineTotalCents)}</span>
        </div>
        ${
          line.modifiers.length > 0
            ? `<div style="font-size: 11px; color: #444; padding-left: 8px;">
                ${line.modifiers.map((m) => `• ${m.name}`).join("<br/>")}
              </div>`
            : ""
        }
      </div>
    `,
    )
    .join("");

  const ticketHtml = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Ticket ${orderLabel(order)}</title>
        <style>
          @page {
            margin: 0;
            size: 80mm auto;
          }
          body {
            font-family: monospace, -apple-system, system-ui, sans-serif;
            font-size: 13px;
            line-height: 1.35;
            color: #000;
            width: 72mm;
            margin: 0 auto;
            padding: 10px 4px;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; }
          .big-number { font-size: 26px; font-weight: 900; margin: 4px 0; }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="bold" style="font-size: 16px; letter-spacing: 1px;">MASAFLOW</div>
          <div style="font-size: 11px;">Al ritmo del comal · POS</div>
          <div class="divider"></div>
          <div style="font-size: 11px;">Comanda de Cocina / Recibo</div>
          <div class="big-number">${orderLabel(order)}</div>
          <div class="bold">${order.customerName}</div>
          <div style="font-size: 11px;">${time(order.createdAt)}</div>
        </div>
        <div class="divider"></div>
        <div>
          ${itemsHtml}
        </div>
        <div class="divider"></div>
        <div class="row bold" style="font-size: 14px;">
          <span>TOTAL</span>
          <span>${mxn(order.totalCents)}</span>
        </div>
        ${
          order.transaction
            ? `
          <div class="row" style="font-size: 12px; margin-top: 4px;">
            <span>Efectivo recibido:</span>
            <span>${mxn(order.transaction.tenderedCents)}</span>
          </div>
          <div class="row" style="font-size: 12px;">
            <span>Cambio entregado:</span>
            <span>${mxn(order.transaction.changeCents)}</span>
          </div>
          ${
            order.transaction.tipCents > 0
              ? `
            <div class="row" style="font-size: 12px;">
              <span>Propina registrada:</span>
              <span>${mxn(order.transaction.tipCents)}</span>
            </div>
          `
              : ""
          }
        `
            : `
          <div class="center bold" style="font-size: 11px; margin-top: 4px;">
            ** POR COBRAR EN CAJA **
          </div>
        `
        }
        <div class="divider"></div>
        <div class="center" style="font-size: 11px;">
          Hecho con masa · Servido con cuidado<br/>
          ¡Gracias por su visita!
        </div>
      </body>
    </html>
  `;

  doc.open();
  doc.write(ticketHtml);
  doc.close();

  iframe.contentWindow?.focus();
  setTimeout(() => {
    iframe.contentWindow?.print();
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000);
  }, 250);
}
