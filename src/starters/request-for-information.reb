<reb-tailwind></reb-tailwind>
<style>body { font-family: "Inter", Arial, sans-serif; color: #1e293b; }</style>

<div class="mb-6 flex items-start justify-between border-b-2 border-indigo-700 pb-4">
  <div><p class="text-sm text-indigo-700">{{.OrganizationName}}</p><h1 class="text-2xl font-bold">Request for information</h1><p class="text-sm text-slate-500">{{.ProjectName}}</p></div>
  <p class="text-sm font-semibold">{{.Reference}}</p>
</div>

<reb-declare type="section" name="s_request" label="Request details"></reb-declare>
<div class="mb-6 grid grid-cols-2 gap-4 text-sm">
  <p>To: <reb-text name="recipient" label="Recipient" required></reb-text></p>
  <p>Discipline: <reb-select name="discipline" label="Discipline" options="Architectural, Structural, Mechanical, Electrical, Civil" required></reb-select></p>
  <p>Drawing: <reb-text name="drawing" label="Drawing or specification reference"></reb-text></p>
  <p><reb-declare name="response_due" label="Response needed by" type="date" required></reb-declare>Response needed: {{formatDate "02/01/2006" .response_due}}</p>
</div>
<h2 class="mb-2 text-lg font-bold"><reb-text name="subject" label="Subject" required></reb-text></h2>
<reb-textarea name="question" label="Question or clarification needed" required class="mb-6 text-sm"></reb-textarea>
<h2 class="mb-2 font-bold">Proposed solution</h2>
<reb-textarea name="proposal" label="Proposed solution" class="mb-6 text-sm"></reb-textarea>
<reb-declare name="has_impact" label="May affect cost or programme" type="checkbox"></reb-declare>
<reb-declare name="impact" label="Potential cost or programme impact" type="textarea" show-if="has_impact" required></reb-declare>
{{if .has_impact}}<div class="mb-6 border-l-4 border-amber-500 bg-amber-50 p-3 text-sm"><strong>Potential impact</strong><p>{{.impact}}</p></div>{{end}}
<reb-photogrid name="photos" label="Supporting photos" class="mb-6 grid grid-cols-2 gap-3"></reb-photogrid>

<reb-declare type="section" name="s_response" label="Response"></reb-declare>
<reb-declare name="answered" label="Response received" type="checkbox"></reb-declare>
<reb-declare name="response" label="Response" type="textarea" show-if="answered" required></reb-declare>
<reb-declare name="responded_by" label="Responded by" type="text" show-if="answered" required></reb-declare>
{{if .answered}}<div class="rounded border border-indigo-200 p-4"><h2 class="mb-2 font-bold">Response</h2><p class="text-sm">{{.response}}</p><p class="mt-4 text-sm text-slate-500">Responded by {{.responded_by}}</p></div>{{end}}
<p class="mt-8 text-xs text-slate-500">Raised by {{.ReporterName}} · {{formatDate "02/01/2006" .CreatedAt}}</p>
