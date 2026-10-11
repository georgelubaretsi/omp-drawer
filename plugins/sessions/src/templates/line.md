{{file}}
{{header}}
{{#if shown}}
{{text}}
{{/if}}
{{#if user}}

{{#with user.before}}
{{#if answers}}answers{{else}}follows{{/if}} {{header}}
{{#if cut}}…{{/if}}{{text}}
{{else}}
answers: no message with text before it
{{/with}}
{{/if}}
{{#if answer}}
{{#if answer.asked}}answers {{answer.asked}}{{else}}answers: no ask call found before it{{/if}}
{{answer.ask}}
{{/if}}
{{#each asks}}
{{ask}}
{{#if answered}}answered on line {{answered.line}} · {{answered.timestamp}}{{else if ended}}no answer: the session ends before one{{else}}no answer in the next {{../lookahead}} lines{{/if}}
{{/each}}
around: {{around}}
