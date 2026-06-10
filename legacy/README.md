# legacy/ — arquivo histórico

- **indexold.html** — o monólito original (HTML + CSS + 141 blocos `<script>`)
  que rodava sobre o backend PHP em workspace.expaturtravel.com. Mantido apenas
  como referência histórica de comportamento.
- **extract.py** — o script que gerou a primeira versão de `src/js/app.js`,
  `src/styles/main.css` e `src/html/body.html` a partir do indexold.html.
- **clientes.csv / tasks.xls** — exports Bitrix24 usados nas importações
  one-time de clientes e tarefas (a UI importa via file picker, qualquer pasta).

⚠️ **NÃO voltar a executar o extract.py.** O `src/js/app.js` recebeu desde então
correções manuais (remoção dos bridges PHP, auth/admin Supabase, assets locais,
fixes de runtime). Regenerá-lo a partir do indexold.html apagaria tudo isso.
