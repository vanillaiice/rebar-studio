let html = `{{multiply .unit_price .qty | formatNumber 2}}`;
console.log(html.replace(/\{\{(?:multiply|add|subtract|divide|sumColumn)\b[^}]+\}\}/g, '0.00'));
