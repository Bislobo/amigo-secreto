# 🎁 Amigo Secreto

App web gratuita para o amigo secreto da família:

1. O organizador cria o amigo secreto, adiciona as pessoas e as casas e envia a cada uma, pelo WhatsApp, um link pessoal.
2. Cada pessoa abre o link e escolhe 3 coisas que gostava de receber.
3. Passadas 72 horas (ou assim que todos escolherem), o sorteio é feito sozinho. Ninguém tira alguém da própria casa.
4. O mesmo link passa a mostrar uma animação de sorteio, com os nomes da mesma casa postos de lado, e revela o amigo secreto com os 3 desejos.
5. No fim, um botão guarda o resultado (nome, desejos e budget de 60 €) no WhatsApp da própria pessoa.

Custo: 0 €. O site fica no GitHub Pages e os dados no plano gratuito do Supabase.

**Ver a animação sem configurar nada:** abre `index.html?demo=1` (ou `index.html?demo=form` para o formulário dos desejos).

## Pôr a funcionar (uma vez, ~10 minutos)

### 1. Base de dados (Supabase)

1. Cria uma conta grátis em [supabase.com](https://supabase.com) e carrega em **New project** (escolhe uma região na Europa).
2. No projeto, abre **SQL Editor**, cola o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e carrega em **Run**.
3. Vai a **Project Settings → API** e copia o **Project URL** e a chave **anon / publishable**.

### 2. Ligar o site à base de dados

Edita o ficheiro [`config.js`](config.js) (no GitHub, abre-o e carrega no lápis) e cola os dois valores:

```js
window.AMIGO_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_KEY: 'a-tua-chave-anon',
};
```

A chave anon é pública por natureza: a base de dados só deixa fazer o que as funções em `schema.sql` permitem.

### 3. Publicar o site (GitHub Pages)

No repositório: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, escolhe `main` e `/ (root)` e guarda. Passado um minuto o site fica em `https://bislobo.github.io/amigo-secreto/`.

## Usar

1. Abre `https://bislobo.github.io/amigo-secreto/admin.html` e cria o amigo secreto. **Guarda nos favoritos o endereço que aparece**: é a tua chave de organizador.
2. Usa **Importar uma lista de casas** (uma casa por linha, ex.: `Casa 1: Maria, José, Rita`) e preenche os números de WhatsApp.
3. Carrega em **Começar**. A partir daí contam 72 horas.
4. Carrega em **Enviar convite** em cada pessoa: o WhatsApp abre com a mensagem pronta, só tens de carregar em Enviar.
5. Quando o sorteio estiver feito, carrega em **Avisar o grupo da família** (ou em **Avisar** em cada pessoa).

## Definições

Na página do organizador, em **Definições do amigo secreto**, podes mudar:

- **Nome** e **budget** máximo.
- **Há casas**: desliga para que qualquer pessoa possa calhar a qualquer outra (só ninguém se tira a si próprio).
- **Desejos**: desliga para não haver a fase dos 3 desejos. Nesse caso o sorteio é feito logo ao carregar em **Começar** e envias a cada pessoa o seu link. Só pode mudar antes de começar.
- **Horas até ao sorteio automático** (72 por omissão). Se mudares depois de começar, o prazo é recalculado a partir do momento em que carregaste em **Começar**.

Depois de mudar o código da base de dados (`supabase/schema.sql`), basta voltar a corrê-lo no SQL Editor: os dados ficam.

## Bom saber

- O temporizador das 72 h corre no Supabase (`pg_cron`, de 5 em 5 minutos). Mesmo que o agendamento não esteja ativo, o sorteio acontece assim que alguém abre a página depois do prazo.
- O organizador também pode participar: a página do organizador não mostra os pares nem os desejos. Mas, como é ele que envia os links, tecnicamente poderia abrir o link de outra pessoa, por isso não o faças. 😉
- Um projeto gratuito do Supabase é pausado ao fim de 7 dias sem uso. Se isso acontecer, entra no Supabase e carrega em **Restore**.

## Ficheiros

| Ficheiro | Para quê |
| --- | --- |
| `index.html`, `participant.js` | Página de cada participante (desejos e revelação) |
| `draw.js`, `draw.css` | Animação do sorteio |
| `admin.html`, `admin.js` | Página do organizador |
| `common.js`, `config.js`, `style.css` | Ligação ao Supabase, WhatsApp e estilo |
| `supabase/schema.sql` | Tabelas, regras de segurança, sorteio e agendamento |
