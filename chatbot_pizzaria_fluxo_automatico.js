// chatbot_pizzaria_fluxo_automatico.js - BOT Pizzaria Di Casa

require('dotenv').config();

const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai'); // Adicionado a biblioteca da OpenAI

// ===== INÍCIO DAS MUDANÇAS: INTEGRAÇÃO COM OPENAI =====
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

const getSystemPrompt = () => {
    // A persona da IA. O que ela deve saber e como deve agir.
    const cardapioInfo = `
    🍕 Pizzas
    • F (Família – 12 fatias) ........ R$ ${CARDAPIO.F.toFixed(2)} (PROMOÇÃO)
    • G (Grande – 8 fatias) .......... R$ ${CARDAPIO.G.toFixed(2)}
    • P (Pequena – 4 fatias) ......... R$ ${CARDAPIO.P.toFixed(2)}

    ➕ Adicionais
    • Borda recheada ................ R$ ${CARDAPIO.Borda.toFixed(2)}

    🥗 Sabores Disponíveis
    • ${CARDAPIO.Sabores.join('\n• ')}
    
    Opções de Menu:
    - Ver Cardápio e fazer pedido (opção 1)
    - Falar com Atendente (opção 3)
    - Ver Promoções (opção 4)
    - Ver Cardápio Digital (opção 5)
    `;

    return `
    Você é a atendente virtual da Pizzaria Di Casa. Seu nome é DiCasaBot.
    Sua função é ser amigável, educada e responder às perguntas dos clientes.
    Sempre que um cliente fizer uma pergunta genérica, responda com base nas informações que você tem.
    Sempre que possível, direcione o cliente a fazer o pedido ou a usar as opções do menu.
    Por exemplo, se um cliente perguntar "Estão abertos?", responda "Olá! Sim, estamos abertos! Para ver nosso cardápio e fazer um pedido, digite 1."
    Não responda a perguntas que não sejam sobre a pizzaria. Se o cliente desviar do assunto, diga que você só pode ajudar com pedidos de pizza.
    
    Aqui estão as informações do cardápio e promoções que você pode usar:
    ${cardapioInfo}
    `;
};

// ===== FIM DAS MUDANÇAS: INTEGRAÇÃO COM OPENAI =====

// ===== CONFIGURAÇÕES GLOBAIS =====
const PIX_INFO = {
  chave: '99991056556',
  nome: 'FRANCISCO ARAUJO MESQUITA',
  banco: 'MERCADO PAGO'
};
// ATUALIZE AQUI COM O ID DO SEU GRUPO DE PEDIDOS! Ex: '1234567890-123456@g.us'
const GRUPO_PEDIDOS = '120363420214800456@g.us';

const DIR_COMPROVANTES = path.resolve(__dirname, 'comprovantes');
if (!fs.existsSync(DIR_COMPROVANTES)) fs.mkdirSync(DIR_COMPROVANTES);

const modoSimulacao = process.argv.includes('--simular');

// Cardápio
const CARDAPIO = {
  P: 25,
  G: 45,
  // === PROMOÇÃO DA PIZZA F FAMÍLIA ===
  F: 49.99,
  // ===================================
  Borda: 5,
  Sabores: ['Calabresa', 'Frango/Catupiry', 'Portuguesa', 'Quatro Queijos', 'Muçarela', 'Napolitana', '4 Queijos']
};

// Nova configuração de taxas de entrega por bairro
const TAXAS_ENTREGA = {
  'centro': 5.00,
  'cj joão paulo ii': 8.00,
  'cj vale do pindaré': 8.00,
  'cj vale do rio doce': 8.00,
  'entroncamento': 8.00,
  'barra azul': 8.00,
  'bairro cikel': 8.00,
  'brasil novo': 8.00,
  'bairro getat': 8.00,
  'bairro jacu': 8.00,
  'jardim alah': 9.50,
  'jardim américa': 8.00,
  'jardim brasil': 8.00,
  'jardim glória 1': 8.00,
  'jardim glória 2': 8.00,
  'jardim glória 3': 8.00,
  'jardim glória city': 8.00,
  'vila laranjeiras': 8.00,
  'matadouro': 8.00,
  'monte sinai': 8.00,
  'nova açailândia': 0.00,
  'nova açailandia 2': 0.00,
  'nova acailandia 2': 0.00,
  'nova acailandia ii': 0.00,
  'açailandia 2': 0.00,
  'acailandia 2': 0.00,
  'vila nova açailandia 2': 0.00,
  'parque das nações': 8.00,
  'parque industrial': 8.00,
  'parque planalto': 8.00,
  'polo moveleiro': 8.00,
  'porto seguro ii': 8.00,
  'vila flávio dino': 8.00,
  'vila bom jardim': 0.00,
  'vila ildemar': 8.00,
  'vila capeloza': 8.00,
  'vila ipiranga': 8.00,
  'vila maranhão': 8.00,
  'vila progresso i': 8.00,
  'vila progresso ii': 8.00,
  'vila são francisco': 8.00,
  'vila sarney filho': 8.00,
  'vila tancredo neves': 8.00,
  'plano da serra': 8.00,
  'pequiá': 8.00,
  'residencial parque da lagoa': 8.00,
  'residencial tropical': 8.00,
  'residencial colina park': 8.00,
  'residencial ouro verde': 8.00,
  'residencial parati': 8.00,
  'padrao': 0.00
};

const pedidosEmAndamento = new Map();
const etapas = ['nome', 'endereco', 'bairro', 'pagamento', 'troco'];
const exemplosEtapas = {
  nome: "📌 Exemplo: João da Silva",
  endereco: "📌 Exemplo: Rua das Flores, nº 123, apto 45",
  bairro: "📌 Exemplo: Centro",
  pagamento: "📌 Exemplo: PIX, Dinheiro ou Cartão",
  troco: "📌 Exemplo: R$ 50,00 ou Não preciso"
};

// === Funções Utilitárias ===
const esperar = ms => new Promise(res => setTimeout(res, ms));

const enviar = async (destino, texto) => {
  const rodape = "\n\nℹ️ Digite 0 para voltar ao menu inicial ou 99 para voltar à pergunta anterior.";
  if (!texto.includes('ℹ️ Digite 0')) {
    texto += rodape;
  }

  if (modoSimulacao) {
    console.log(`[${destino}] ... digitando`);
    await esperar(Math.min(2000 + texto.length * 10, 5000));
    console.log(`\n[Para ${destino}]\n${texto}\n`);
  } else {
    const chat = await client.getChatById(destino);
    await chat.sendStateTyping();
    await esperar(Math.min(2000 + texto.length * 10, 5000));
    await client.sendMessage(destino, texto);
  }
};

async function enviarPedidoParaGrupo(pedidoData) {
  if (!GRUPO_PEDIDOS) return console.log('AVISO: O ID do grupo de pedidos não está configurado.');
  
  const mensagem = `🔔 NOVO PEDIDO CONFIRMADO! 🔔\n\n` +
                   `📞 Cliente: ${pedidoData.nome} (${pedidoData.numero})\n` +
                   `📍 Endereço: ${pedidoData.endereco}, ${pedidoData.bairroCorrigido || pedidoData.bairro}\n` +
                   `🧾 Detalhes do Pedido:\n` +
                   `${pedidoData.resumoCompleto || pedidoData.resumo}\n\n` +
                   `💳 Pagamento: ${pedidoData.pagamento}\n` +
                   `💸 Troco: ${pedidoData.troco ? 'para ' + pedidoData.troco : 'Não precisa'}\n\n` +
                   `✅ Status: ${pedidoData.status}`;

  if (modoSimulacao) {
      console.log(`\n[Para o Grupo de Pedidos]\n${mensagem}\n`);
  } else {
      await client.sendMessage(GRUPO_PEDIDOS, mensagem);
  }
}

function salvarPedidoCSV(dados) {
  const file = path.resolve(__dirname,'pedidos.csv');
  const hdr = 'nome,endereco,bairro,pagamento,pedidos,total,status,datahora,numero,troco\n';
  if (!fs.existsSync(file)) fs.writeFileSync(file,hdr,'utf8');
  const linha = `"${dados.nome}","${dados.endereco}","${dados.bairroCorrigido || dados.bairro}","${dados.pagamento}","${dados.resumo.replace(/"/g, '""')}","${dados.total.toFixed(2)}","${dados.status}","${moment().format('YYYY-MM-DD HH:mm')}","${dados.numero}","${dados.troco || 'N/A'}"\n`;
  fs.appendFileSync(file,linha,'utf8');
}

// NOVO: Função para calcular a distância entre duas strings
function levenshtein(s1, s2) {
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) {
      costs[s2.length] = lastValue;
    }
  }
  return costs[s2.length];
}

// NOVO: Função para encontrar sabores no texto
function acharSabores(texto) {
    const saboresEncontrados = [];
    const textoNormalizado = texto.toLowerCase();
    for (const sabor of CARDAPIO.Sabores) {
        const saborNormalizado = sabor.toLowerCase().replace('/catupiry', '');
        if (textoNormalizado.includes(saborNormalizado) || levenshtein(textoNormalizado, saborNormalizado) <= 2) {
            saboresEncontrados.push(sabor);
        }
    }
    return saboresEncontrados;
}

// NOVO: Função de parsing de pedidos mais robusta
function parsePedido(txt) {
  const pedidos = [];
  const partes = txt.replace(/ e | com | metade /ig, ',').split(',').map(p => p.trim());
  
  let pedidoAtual = { qtd: 1, tamanho: null, sabores: [], borda: false };

  for (const parte of partes) {
    const numMatch = parte.match(/(\d+)/);
    const qtd = numMatch ? parseInt(numMatch[1]) : 1;
    
    let tamanho = null;
    if (/\bP\b/i.test(parte) || /pequena/i.test(parte)) tamanho = 'P';
    else if (/\bG\b/i.test(parte) || /grande/i.test(parte)) tamanho = 'G';
    else if (/\bF\b/i.test(parte) || /fam(í|i)lia/i.test(parte)) tamanho = 'F';

    const sabores = acharSabores(parte);
    const temBorda = /borda/i.test(parte);

    if (tamanho && sabores.length > 0) {
      if (pedidoAtual.tamanho && pedidoAtual.sabores.length > 0) {
        pedidos.push(pedidoAtual);
        pedidoAtual = { qtd: 1, tamanho: null, sabores: [], borda: false };
      }
      pedidoAtual.qtd = qtd;
      pedidoAtual.tamanho = tamanho;
      pedidoAtual.sabores = sabores;
      pedidoAtual.borda = temBorda;
    } else if (sabores.length > 0) {
      // Caso não tenha tamanho, adiciona ao pedido anterior
      pedidoAtual.sabores = pedidoAtual.sabores.concat(sabores);
      pedidoAtual.borda = pedidoAtual.borda || temBorda;
    }
  }

  if (pedidoAtual.tamanho && pedidoAtual.sabores.length > 0) {
    pedidos.push(pedidoAtual);
  }

  // Se nenhum pedido foi identificado por formato complexo, tenta o formato simples
  if (pedidos.length === 0) {
    const sabor = acharSabores(txt)[0];
    const tamanhoMatch = txt.match(/\b(P|G|F|pequena|grande|fam(í|i)lia)\b/i);
    const qtdMatch = txt.match(/(\d+)/);

    if (sabor && tamanhoMatch) {
      const tamanho = tamanhoMatch[1].toUpperCase().charAt(0);
      pedidos.push({
        qtd: qtdMatch ? parseInt(qtdMatch[1]) : 1,
        tamanho,
        sabores: [sabor],
        borda: /borda/i.test(txt)
      });
    }
  }

  return pedidos;
}

// NOVO: Função para calcular o subtotal e gerar o resumo
function calcularSubtotal(pedidos) {
  let subtotal = 0;
  let resumo = '';
  pedidos.forEach(p => {
    const precoBase = CARDAPIO[p.tamanho] || 0;
    const precoBorda = p.borda ? CARDAPIO.Borda : 0;
    const subtotalItem = (precoBase + precoBorda) * p.qtd;
    subtotal += subtotalItem;
    resumo += `\n- ${p.qtd}x Pizza ${p.tamanho} (${p.sabores.join(' / ')}${p.borda ? ' + Borda' : ''}) – R$${subtotalItem.toFixed(2)}`;
  });
  return { resumo, subtotal };
}

function menuInicial(nomeCliente = 'Cliente') {
  return `🍕 Olá, ${nomeCliente}! Seja bem-vindo à Pizzaria Di Casa! 😄

📲 Peça rápido pelo Cardápio Digital:
👉 https://instadelivery.com.br/pizzariadicasa1

Ou escolha uma opção pelo WhatsApp:
1 - Ver Cardápio e fazer pedido
3 - Falar com Atendente
4 - Ver Promoções
5 - Ver Cardápio Digital`;
}

// === Inicialização do cliente WhatsApp ===
let client;
if (!modoSimulacao) {
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  client.on('qr', qr => qrcode.generate(qr, { small: true }));
  client.on('ready', () => console.log('✅ WhatsApp pronto!'));
  client.initialize();
}

// === Handler Principal ===
async function processarMensagem(from, raw, pushname) {
  const text = raw.trim().toLowerCase();
  let estado = pedidosEmAndamento.get(from);

  // Lógica de controle de fluxo (voltar, cancelar)
  if (text === '0') {
    pedidosEmAndamento.delete(from);
    return enviar(from, menuInicial(pushname));
  }
  if (text === '99' && estado) {
    const idx = etapas.indexOf(estado.etapa);
    if (idx > 0) {
        estado.etapa = etapas[idx - 1];
    } else {
        pedidosEmAndamento.delete(from);
        return enviar(from, menuInicial(pushname));
    }
    return enviar(from, `Digite seu ${estado.etapa}:\n${exemplosEtapas[estado.etapa]}`);
  }

  // Se o cliente já está em um fluxo de pedido
  if (estado) {
    const etapaAtual = estado.etapa;
    
    // Validações de cada etapa
    if (etapaAtual === 'nome' && !text.length) {
      return enviar(from, `❌ Por favor, digite um nome válido.`);
    }
    if (etapaAtual === 'endereco' && !text.length) {
      return enviar(from, `❌ Por favor, digite um endereço válido.`);
    }

    // Processa a resposta da etapa atual
    if (etapaAtual === 'nome') {
        estado.nome = raw;
        estado.etapa = 'endereco';
        return enviar(from, `📍 Digite o endereço completo (Rua, Número, Referência):\n${exemplosEtapas.endereco}`);
    }
    
    if (etapaAtual === 'endereco') {
        estado.endereco = raw;
        estado.etapa = 'bairro';
        const bairrosFormatados = Object.keys(TAXAS_ENTREGA).filter(b => b !== 'padrao').join(", ");
        return enviar(from, `📌 Digite o seu bairro (Taxa de Entrega):\n\n${bairrosFormatados}`);
    }

    if (etapaAtual === 'bairro') {
        const bairroNormalizado = text;
        let bairroEncontrado = TAXAS_ENTREGA.padrao;
        let nomeBairroCorrigido = "Padrão";
        
        let encontrou = false;
        for (const bairro of Object.keys(TAXAS_ENTREGA)) {
            if (bairro === 'padrao') continue;
            const distance = levenshtein(bairroNormalizado, bairro);
            if (distance <= 2) { 
                bairroEncontrado = TAXAS_ENTREGA[bairro];
                nomeBairroCorrigido = bairro;
                encontrou = true;
                break;
            }
        }
        
        if (!encontrou) {
             return enviar(from, `❌ Bairro não encontrado. Por favor, verifique a escrita ou digite "Padrão" para entrega a ser verificada.`);
        }

        const total = estado.subtotal + bairroEncontrado;
        
        estado.taxaEntrega = bairroEncontrado;
        estado.total = total;
        estado.bairroCorrigido = nomeBairroCorrigido;

        const resumoCompleto = `${estado.resumo}\n\nSubtotal: R$${estado.subtotal.toFixed(2)}\nTaxa de entrega (${estado.bairroCorrigido}): R$${bairroEncontrado.toFixed(2)}\nTotal: R$${total.toFixed(2)}`;
        
        estado.resumoCompleto = resumoCompleto;
        estado.etapa = 'pagamento';
        pedidosEmAndamento.set(from, estado);
        return enviar(from, `${resumoCompleto}\n\nDigite a forma de pagamento:\n${exemplosEtapas.pagamento}`);
    }

    if (etapaAtual === 'pagamento') {
      estado.pagamento = text;
      estado.numero = from.split('@')[0];
      if (text.includes('pix')) {
        estado.status = 'Pendente';
        estado.aguardandoComprovante = true;
        pedidosEmAndamento.set(from, estado);
        return enviar(from, `💳 PIX — envie o comprovante (JPG, PNG ou PDF).\nChave: ${PIX_INFO.chave}\nNome: ${PIX_INFO.nome}\nBanco: ${PIX_INFO.banco}\nValor: R$${estado.total.toFixed(2)}`);
      } else if (text.includes('dinheiro')) {
        estado.etapa = 'troco';
        pedidosEmAndamento.set(from, estado);
        return enviar(from, `💰 Pagamento em dinheiro.\n\nPrecisa de troco para quanto?\n${exemplosEtapas.troco}`);
      } else if (text.includes('cartão') || text.includes('cartao')) {
        estado.status = 'Pago';
        estado.troco = 'N/A';
        salvarPedidoCSV(estado);
        enviarPedidoParaGrupo(estado);
        pedidosEmAndamento.delete(from);
        return enviar(from, `✅ Pedido confirmado! Previsão: 40 minutos. Levaremos a maquininha de cartão.`);
      } else {
        return enviar(from, `❌ Não entendi a forma de pagamento. Por favor, digite novamente: PIX, Dinheiro ou Cartão.`);
      }
    }

    if (etapaAtual === 'troco') {
      estado.troco = raw;
      estado.status = 'Pago';
      salvarPedidoCSV(estado);
      enviarPedidoParaGrupo(estado);
      pedidosEmAndamento.delete(from);
      return enviar(from, `✅ Pedido confirmado! Previsão: 40 minutos.`);
    }

    // Se a etapa não for nenhuma das acima, avança para a próxima
    const idx = etapas.indexOf(etapaAtual);
    const proximaEtapa = etapas[idx + 1];
    if (proximaEtapa) {
        estado.etapa = proximaEtapa;
        pedidosEmAndamento.set(from, estado);
        return enviar(from, `Digite seu ${exemplosEtapas[proximaEtapa]}`);
    }

    return enviar(from, `❓ Opção inválida. Escolha uma das opções abaixo:\n\n` + menuInicial());
  }

  // ==== INÍCIO DAS MUDANÇAS: Lógica Híbrida ====

  // 1. Tenta parsear o pedido diretamente
  const pedidos = parsePedido(raw);
  if (pedidos.length > 0) {
      const { resumo, subtotal } = calcularSubtotal(pedidos);
      pedidosEmAndamento.set(from, { resumo, subtotal, pedidos, etapa: 'nome' });
      return enviar(from, `🧾 RESUMO DO PEDIDO:${resumo}\n\nSubtotal: R$${subtotal.toFixed(2)}\n\nDigite seu nome:\n${exemplosEtapas.nome}`);
  }
  
  // 2. Tenta encontrar um comando do menu fixo
  switch (text) {
    case '1':
      return enviar(from, `📜 NOSSO CARDÁPIO 🍕
━━━━━━━━━━━━━━
🍕 Pizzas
• F (Família – 12 fatias) ........ R$ ${CARDAPIO.F.toFixed(2)} (PROMOÇÃO)
• G (Grande – 8 fatias) .......... R$ ${CARDAPIO.G.toFixed(2)}
• P (Pequena – 4 fatias) ......... R$ ${CARDAPIO.P.toFixed(2)}

➕ Adicionais
• Borda recheada ................ R$ ${CARDAPIO.Borda.toFixed(2)}

🥗 Sabores Disponíveis
• ${CARDAPIO.Sabores.join('\n• ')}

📌 Para fazer o pedido, digite no formato abaixo:
Exemplo: 1 G Calabresa com borda e 1 F metade Frango/Catupiry, metade Portuguesa`);
    case '3':
      return enviar(from, '👨‍🍳 Um atendente irá lhe atender em instantes.');
    case '4':
      return enviar(from, '🔥 Promoção: Na compra de 2 G, ganhe 1 refrigerante 1L!');
    case '5':
      return enviar(from, '📲 Cardápio digital: https://instadelivery.com.br/pizzariadicasa1');
    // 3. Se nada acima for encontrado, chama a IA.
    default:
        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: getSystemPrompt() },
                    { role: "user", content: raw }
                ],
                max_tokens: 150,
            });

            const respostaIA = completion.choices[0].message.content.trim();
            return enviar(from, respostaIA);

        } catch (error) {
            console.error("Erro ao chamar a API da OpenAI:", error.response ? error.response.data : error.message);
            return enviar(from, `Desculpe, não entendi. Por favor, escolha uma das opções abaixo:\n\n` + menuInicial(pushname));
        }
  }
}
// ==== FIM DAS MUDANÇAS: Lógica Híbrida ====

// === Escuta de mensagens ===
if (!modoSimulacao) {
  client.on('message', async msg => {
    const from = msg.from;
    const estado = pedidosEmAndamento.get(from);

    if (estado && estado.aguardandoComprovante && msg.hasMedia) {
      const media = await msg.downloadMedia();
      const ext = media.mimetype.split('/')[1];
      const filename = `${from.replace(/[^0-9]/g,'')}_${moment().format('YYYY-MM-DD_HH-mm')}.${ext}`;
      const filepath = path.join(DIR_COMPROVANTES, filename);
      fs.writeFileSync(filepath, media.data, 'base64');
      
      estado.status = 'Pago';
      estado.troco = 'N/A';
      salvarPedidoCSV(estado);
      enviarPedidoParaGrupo(estado);
      pedidosEmAndamento.delete(from);
      return enviar(from, `✅ Comprovante recebido! Seu pedido foi confirmado e está a caminho.`);
    }

    processarMensagem(from, msg.body, msg._data.notifyName || 'Cliente');
  });
} else {
  console.log('🧪 Simulação ativa — digite mensagens:');
  const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  readline.on('line', line => processarMensagem('cliente-simulado', line, 'Cliente Teste'));
}