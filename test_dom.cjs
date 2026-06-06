const { JSDOM } = require("jsdom");
const rawHTML = `<table class="border border-collapse border-1 w-full text-sm">
      <thead class="bg-slate-100">
      </thead>
      <tbody>
        <tr reb-row>
          <td class="border p-1 text-center">{{.no}}</td>
          <td class="border p-1">{{.name}}</td>
          <td class="border p-1 text-right">{{.unit_price}}</td>
          <td class="border p-1 text-center">{{.qty}}</td>
          <td class="border p-1 text-right font-bold">
            \${{multiply .unit_price .qty | formatNumber 2}}
          </td>
          <td class="border p-1">{{.notes}}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr class="bg-slate-50">
          <td colspan="4" class="border p-2 text-right font-bold uppercase text-xs">
            Grand Total
          </td>
          <td colspan="2" class="border p-2 text-left font-black text-lg text-brand-amber">
            \${{sumColumn .inspection_details "total_price" | formatNumber 2}}
          </td>
        </tr>
      </tfoot>
    </table>`;

const dom = new JSDOM(`<body>${rawHTML}</body>`);
let previewHtml = dom.window.document.body.innerHTML;
console.log("BEFORE:");
console.log(previewHtml);

previewHtml = previewHtml.replace(/\{\{(?:multiply|add|subtract|divide|sumColumn)\b[^}]+\}\}/g, '0.00');

console.log("\nAFTER:");
console.log(previewHtml);
