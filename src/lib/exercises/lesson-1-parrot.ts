/**
 * Aula 1 do curso Corgly — "O aluno que conversou com o papagaio".
 *
 * ORIGEM DO CONTEUDO (copiado, nao importado):
 *   corgly-desktop/corgly-classes/dados-aulas/
 *     "1 - O aluno que conversou com o papagaio.json"
 *   campos `multipla[]` (perguntas) e `verbo` (ponto gramatical).
 *
 * O corgly-saas NAO pode ler esse caminho em runtime: o repositorio de aulas e
 * um repo irmao que nao existe no servidor de producao. Por isso o conteudo
 * vive aqui como dado tipado, versionado junto com o app. Atualizacao da aula
 * na fonte = nova copia deste arquivo, nunca edicao solta.
 *
 * FORMA DA QUESTAO (contrato da fonte):
 *   corgly-classes/rules/09-secao6-multipla-escolha.md
 *   - R-MC-01: minimo 4 perguntas, exatamente 4 alternativas cada, sem
 *     alternativa vazia, placeholder ou duplicada;
 *   - R-MC-09: as 8 questoes saem do texto principal da aula.
 *   As invariantes sao verificadas em `catalog.ts` — dado que viola a regra da
 *   fonte falha alto, nao renderiza torto.
 *
 * GABARITO: a aula nao traz o campo `correta`. A regra fixa a convencao das
 * aulas legadas: "aulas legadas sem o campo mantem a convencao de que a
 * primeira alternativa e a correta e recebem a mesma distribuicao ao gerar o
 * DOCX". Por isso `correctSourceIndex` e 0 em todas as questoes — e o dado da
 * fonte, nao escolha desta tela. A distribuicao das letras a/b/c/d acontece em
 * `answer-distribution.ts`, do mesmo jeito que o gerador da fonte faz, sem
 * alterar a ordem registrada aqui.
 *
 * TEXTO VERBATIM: enunciados, alternativas e a nota gramatical estao exatamente
 * como na fonte, incluindo as aspas curvas e o artefato `""-AR""` na versao em
 * ingles da nota. Corrigir aqui cria divergencia silenciosa com o curso; a
 * correcao pertence ao corgly-classes.
 */

import type { LessonExerciseSource } from './types';

export const LESSON_1_PARROT: LessonExerciseSource = {
  lessonNumber: 1,
  slug: 'aula-1-o-aluno-que-conversou-com-o-papagaio',
  title: 'O aluno que conversou com o papagaio',
  level: 1,
  sourceFile: '1 - O aluno que conversou com o papagaio.json',
  grammarPoint: {
    title: 'Estudo verbal: Presente + verbos regulares em -AR (+ chamar-se)',
    explanation: {
      pt:
        'O presente do indicativo serve para apresentar identidades, hábitos e fatos atuais, por isso sustenta cumprimentos e apresentações do dia a dia. Nos verbos regulares em -AR, retiramos -ar e ligamos ao radical as terminações -o, -a, -amos e -am conforme a pessoa. Com o verbo chamar-se, diga: Eu me chamo Bruno e Você se chama Ana, com o pronome reflexivo antes do verbo. O verbo morar segue o padrão em Eu moro no Recife e Eles moram perto. Treinar forma treino e treinam. Conversar e cumprimentar mantêm o mesmo radical no presente, e o sujeito pode ficar implícito quando a terminação já indica a pessoa. Um erro comum: esquecer o pronome reflexivo ("Eu chamo Bruno" em vez de "Eu me chamo Bruno"). Para negar, ponha não antes do verbo, como em Eu não moro aqui, e a pergunta usa a mesma forma com a voz subindo no fim: Você mora aqui?',
      en:
        'The present tense describes current actions and habits, so it works for greetings and introductions. With regular ""-AR"" verbs, remove "-ar" and add "-o", "-a", "-amos" or "-am" to the stem by person. The verb "chamar-se" (to be called) uses a reflexive pronoun: "Eu me chamo Bruno" (I am called Bruno). The verb "morar" (to live) follows the same pattern: "Eu moro aqui agora" (I live here now). "Treinar" forms "treino" and "treinam". "Conversar" and "cumprimentar" keep the same stem in the present, and the subject can stay implicit when the ending already shows the person. A common error: forgetting the reflexive pronoun ("Eu chamo Bruno" instead of "Eu me chamo Bruno"). To make it negative, put "não" before the verb: "Eu não moro aqui", and questions use the same form with rising voice.',
      es:
        'El presente de indicativo sirve para presentar identidades, hábitos y hechos actuales, por eso sostiene saludos y presentaciones cotidianas. Con verbos regulares en ""-AR"", el portugués quita "-ar" y añade al radical "-o", "-a", "-amos" o "-am" según la persona del sujeto. Con el verbo "chamar-se", di: "Eu me chamo Bruno" y "Você se chama Ana", con el pronombre reflexivo antes del verbo. El verbo "morar" sigue el patrón en "Eu moro no Recife" y "Eles moram perto". "Treinar" forma "treino" y "treinam". "Conversar" y "cumprimentar" conservan el mismo radical en presente, y el sujeto puede omitirse cuando la terminación identifica a la persona. Un error común: olvidar el pronombre reflexivo ("Eu chamo Bruno" en vez de "Eu me chamo Bruno"). Para negar, pon "não" antes del verbo, como en Eu não moro aqui, y la pregunta usa la misma forma con la voz subiendo al final: "Você mora aqui"?',
    },
  },
  questions: [
    {
      id: 'aula-1-q1',
      prompt:
        'Bruno diz a seu Jorge que conversou com uma amiga na cozinha. Por que a reação de seu Jorge é de surpresa?',
      options: [
        'Porque ele sabe que não há ninguém na cozinha',
        'Porque ele não ouviu nenhuma voz naquela manhã',
        'Porque ele não quer visita nova na casa naquele dia',
        'Porque ele acha que Bruno ainda está dormindo',
      ],
      correctSourceIndex: 0,
    },
    {
      id: 'aula-1-q2',
      prompt:
        'Seis meses depois, Bruno já tinha muitos amigos de verdade. O que o texto aponta como o começo dessa mudança?',
      options: [
        'As conversas de toda manhã com o papagaio da casa',
        'As aulas que ele foi fazer na cidade grande',
        'Os treinos na frente do espelho antes da viagem',
        'A ajuda de seu Jorge para achar novos vizinhos',
      ],
      correctSourceIndex: 0,
    },
    {
      id: 'aula-1-q3',
      prompt:
        'Por que Bruno repetia as mesmas frases na frente do espelho antes de viajar?',
      options: [
        'Porque queria causar boa impressão nos vizinhos',
        'Porque o professor dele mandava fazer isso todo dia',
        'Porque não gostava do som da própria voz em público',
        'Porque precisava decorar o endereço da casa nova',
      ],
      correctSourceIndex: 0,
    },
    {
      id: 'aula-1-q4',
      prompt:
        'O que faz Bruno achar a conversa da cozinha um pouco esquisita?',
      options: [
        'A voz devolve as mesmas perguntas em vez de responder',
        'A voz fala baixo demais e ele não entende as palavras',
        'A voz responde em outra língua e ele fica sem entender',
        'A voz chama por seu Jorge e não por ele, o hóspede novo',
      ],
      correctSourceIndex: 0,
    },
    {
      id: 'aula-1-q5',
      prompt:
        'Bruno saiu radiante da cozinha depois de vinte minutos. O que isso mostra sobre ele naquele dia?',
      options: [
        'Que a conversa valia mais do que quem respondia',
        'Que ele já falava português melhor do que os vizinhos',
        'Que ele tinha desistido de fazer amigos naquela cidade',
        'Que o café da manhã de seu Jorge estava demorando muito',
      ],
      correctSourceIndex: 0,
    },
    {
      id: 'aula-1-q6',
      prompt:
        'Por que Bruno voltou a falar com o Louro nas manhãs seguintes, mesmo depois da vergonha?',
      options: [
        'Porque o papagaio nunca corrigia nem ria dele',
        'Porque seu Jorge pediu que ele cuidasse da ave',
        'Porque queria ensinar frases novas ao papagaio',
        'Porque tinha medo de falar com os vizinhos',
      ],
      correctSourceIndex: 0,
    },
    {
      id: 'aula-1-q7',
      prompt:
        'Bruno vê o papagaio na gaiola e pensa: “Que situação esquisita!”. O que isso quer dizer?',
      options: [
        'Que a situação foi estranha',
        'Que a situação foi deliciosa',
        'Que a situação foi cansativa',
        'Que a situação foi demorada',
      ],
      correctSourceIndex: 0,
    },
    {
      id: 'aula-1-q8',
      prompt:
        'Seu Jorge diz que o Louro cumprimenta todo mundo. O que o papagaio faz?',
      options: [
        'Diz “bom dia” para quem chega',
        'Elogia o trabalho de quem chega',
        'Preenche uma ficha para quem chega',
        'Serve uma xícara para quem chega',
      ],
      correctSourceIndex: 0,
    },
  ],
};
