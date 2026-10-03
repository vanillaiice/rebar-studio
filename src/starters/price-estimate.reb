<reb-tailwind></reb-tailwind>

<style>body { font-family: "Inter", Arial, sans-serif; color: #0f172a; }</style>

<div class="mb-8 flex items-start justify-between">
  <div>
    {{if .OrganizationLogo}}<img src="{{.OrganizationLogo}}" class="mb-3 h-12 object-contain">{{end}}
    <p class="font-bold">{{.OrganizationName}}</p>
  </div>
  <div class="text-right">
    <h1 class="text-3xl font-bold text-slate-800">Estimate</h1>
    <p class="text-sm text-slate-500">{{.Reference}} · {{formatDate "02/01/2006" .CreatedAt}}</p>
  </div>
</div>

<div class="mb-6 text-sm">
  <p class="text-slate-500">Prepared for</p>
  <p class="font-semibold"><reb-text name="client" label="Client" required></reb-text></p>
  <p><reb-text name="client_address" label="Client address"></reb-text></p>
  <reb-declare name="currency" label="Currency" type="select" options="QAR, USD, EUR, SAR, AED" default="QAR"></reb-declare>
  <reb-declare name="vat_rate" label="VAT rate (%)" type="number" default="0" min="0" max="100"></reb-declare>
</div>

<reb-table name="items" label="Items" options="no:autoincrement,description:text,unit:select[ea|m|m2|m3|kg|hr|lump sum],qty:number,rate:number,amount:formula[qty*rate|2]">
  <table class="w-full border-collapse text-sm">
    <thead><tr class="border-b-2 border-slate-800 text-left"><th class="py-2 w-8">#</th><th class="py-2">Description</th><th class="py-2 w-16">Unit</th><th class="py-2 w-16 text-right">Qty</th><th class="py-2 w-28 text-right">Rate</th><th class="py-2 w-32 text-right">Amount</th></tr></thead>
    <tbody>
      <tr reb-row class="border-b border-slate-200">
        <td class="py-2">{{.no}}</td><td class="py-2">{{.description}}</td><td class="py-2">{{.unit}}</td>
        <td class="py-2 text-right">{{.qty}}</td><td class="py-2 text-right">{{formatMoney .rate "" 2}}</td><td class="py-2 text-right">{{formatMoney .amount "" 2}}</td>
      </tr>
    </tbody>
  </table>
</reb-table>

<table class="ml-auto mt-4 w-72 text-sm">
  <tr><td class="py-1 text-slate-500">Subtotal</td><td class="py-1 text-right">{{sumColumn .items "amount" | formatMoney .currency 2}}</td></tr>
  <tr><td class="py-1 text-slate-500">VAT {{.vat_rate}}%</td><td class="py-1 text-right">{{divide (multiply (sumColumn .items "amount") .vat_rate) 100 | formatMoney .currency 2}}</td></tr>
  <tr class="border-t-2 border-slate-800 text-base font-bold"><td class="py-2">Total</td><td class="py-2 text-right">{{add (sumColumn .items "amount") (divide (multiply (sumColumn .items "amount") .vat_rate) 100) | formatMoney .currency 2}}</td></tr>
</table>

<div class="mt-10 text-sm">
  <p class="text-slate-500">Notes and exclusions</p>
  <reb-textarea name="notes" label="Notes and exclusions"></reb-textarea>
  <p class="mt-4 text-slate-500">Valid for <reb-number name="validity_days" label="Valid for (days)" default="30"></reb-number> days.</p>
</div>
