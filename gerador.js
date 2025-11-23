import * as fs from 'fs/promises';

// --- CONFIGURAÇÃO DA GEMINI API ---
const apiKey = process.env.GEMINI_API_KEY; // Assumindo que a chave está em process.env
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
// MUDANÇA: O arquivo de destino agora é 'data.json'
const KNOWLEDGE_FILE = 'data.json'; 

// --- CONFIGURAÇÃO DE GERAÇÃO ---
const TOTAL_ITEMS = 25;    

// MUDANÇA: Estrutura JSON esperada para UMA VAGA DE EMPREGO
const responseSchema = {
    type: "ARRAY",
    items: {
        type: "OBJECT",
        properties: {
            "nome": { "type": "STRING", "description": "Nome da vaga (ex: Analista de RH, Desenvolvedor Front-end)." },
            "empresa": { "type": "STRING", "description": "Nome da empresa contratante (ex: TechCorp, Global Services)." },
            "modalidade": { "type": "STRING", "description": "Modalidade de trabalho, um de: 'Remoto', 'Híbrido' ou 'Presencial'." },
            "descricao": { "type": "STRING", "description": "Descrição concisa da vaga, mencionando uma curiosidade histórica sobre a área." },
            "ano_historico": { "type": "STRING", "description": "Ano relevante à curiosidade histórica mencionada na descrição (ex: '1995')." },
            "link": { "type": "STRING", "description": "URL de aplicação simulada (ex: 'https://exemplo.com/vaga-nome')." },
            "tipo_deficiencia": { "type": "STRING", "description": "O tipo de deficiência mais adequado à vaga, um de: 'fisica', 'auditiva', 'visual', 'intelectual', 'mental' ou 'multipla'." },
            "tags": {
                "type": "ARRAY",
                "description": "Array de 3 a 5 strings que categorizam a vaga (ex: 'RH', 'Tecnologia', 'Atendimento', 'Escritório').",
                "items": { "type": "STRING" }
            }
        },
        "required": ["nome", "empresa", "modalidade", "descricao", "ano_historico", "link", "tipo_deficiencia", "tags"]
    }
};

/**
 * Espera de forma assíncrona.
 * @param {number} ms - Milissegundos para esperar.
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Função para gerar as vagas de emprego em uma única chamada à API.
 * @returns {Promise<Array<Object>>} Array com as 25 novas vagas.
 */
async function generateNewKnowledge(existingKnowledge) {
    // Lista de nomes de vagas e empresas existentes para evitar repetição (para incluir no prompt)
    const existingNames = existingKnowledge.map(item => `${item.nome} na ${item.empresa}`).join(', ');

    // MUDANÇA: Prompt de Sistema focado em VAGAS PCD
    const systemPrompt = `Você é um curador de vagas de emprego inclusivas. Sua tarefa é criar ${TOTAL_ITEMS} novas vagas com a estrutura JSON fornecida, garantindo que sejam diversas em áreas (Tecnologia, Administrativo, Serviços, etc.) e que cada uma seja adequada a pelo menos um dos tipos de deficiência listados. Inclua uma curiosidade histórica sobre a área na descrição e seu respectivo ano em 'ano_historico'.`;
    
    // MUDANÇA: Query do Usuário focado em VAGAS PCD e não repetição
    const userQuery = `Gere uma lista de ${TOTAL_ITEMS} novas vagas de emprego para Pessoas com Deficiência (PCD). Distribua as vagas entre as modalidades 'Remoto', 'Híbrido' e 'Presencial', e também entre os tipos de deficiência. Siga estritamente a estrutura JSON e o requisito de ser um ARRAY com EXATAMENTE ${TOTAL_ITEMS} objetos. NÃO use NENHUMA das seguintes combinações de Vaga/Empresa: ${existingNames}.`;

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: responseSchema
        }
    };

    let response;
    let retries = 0;
    const maxRetries = 5;

    while (retries < maxRetries) {
        try {
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;

                if (jsonText) {
                    try {
                        const newKnowledge = JSON.parse(jsonText);
                        
                        if (Array.isArray(newKnowledge) && newKnowledge.length === TOTAL_ITEMS) {
                            console.log(`Sucesso! ${TOTAL_ITEMS} novas vagas geradas pela API.`);
                            return newKnowledge;
                        } else {
                            // Se o modelo não gerou o número exato, tentamos novamente
                            throw new Error(`O array retornado não contém ${TOTAL_ITEMS} itens. Encontrados: ${Array.isArray(newKnowledge) ? newKnowledge.length : 0}`);
                        }
                    } catch (parseError) {
                        throw new Error("JSON malformado ou incompleto na resposta da API.");
                    }
                } else {
                    throw new Error("Resposta da API vazia ou sem conteúdo textual.");
                }
            } else {
                throw new Error(`Falha na API com status ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            retries++;
            if (retries < maxRetries) {
                const waitTime = Math.pow(2, retries) * 1000; // 2s, 4s, 8s, ...
                await delay(waitTime);
            } else {
                throw new Error(`Falha ao gerar o conhecimento após várias tentativas: ${error.message}`);
            }
        }
    }
}


/**
 * Função principal para executar o fluxo de trabalho.
 */
async function main() {
    // Verifica se a chave da API está presente
    if (!apiKey) {
        console.error("\n❌ ERRO: A variável de ambiente GEMINI_API_KEY não está definida.");
        console.log("Por favor, crie um arquivo '.env' na raiz do projeto e defina a chave:");
        console.log("GEMINI_API_KEY=\"SUA_CHAVE_AQUI\"");
        return;
    }

    try {
        // 1. Carregar a base de conhecimento existente
        let existingKnowledge = [];
        try {
            const data = await fs.readFile(KNOWLEDGE_FILE, 'utf-8');
            existingKnowledge = JSON.parse(data);
            console.log(`Base de vagas inicial carregada. Total de itens: ${existingKnowledge.length}`);
        } catch (e) {
            if (e.code === 'ENOENT') {
                console.log(`O arquivo ${KNOWLEDGE_FILE} não foi encontrado. Iniciando com uma base vazia.`);
                existingKnowledge = []; // Certifica que é um array vazio para não quebrar a combinação
            } else {
                throw new Error(`Erro ao ler/analisar ${KNOWLEDGE_FILE}: ${e.message}`);
            }
        }

        // 2. Gerar as 25 novas entradas (passando a base existente para o prompt)
        console.log(`Gerando ${TOTAL_ITEMS} novas vagas de emprego inclusivas...`);
        const newKnowledge = await generateNewKnowledge(existingKnowledge);

        // 3. Combinar as bases
        const totalKnowledge = [...existingKnowledge, ...newKnowledge];
        console.log(`Base de vagas combinada. Total final de itens: ${totalKnowledge.length}`);

        // 4. Salvar a nova base no arquivo
        await fs.writeFile(KNOWLEDGE_FILE, JSON.stringify(totalKnowledge, null, 2), 'utf-8');
        console.log(`\n🎉 SUCESSO!`);
        console.log(`O arquivo de vagas '${KNOWLEDGE_FILE}' foi atualizado com ${totalKnowledge.length} itens.`);

    } catch (error) {
        console.error("\n❌ ERRO FATAL:", error.message);
        console.log("Verifique se sua chave de API está correta e se há conectividade.");
    }
}

main();