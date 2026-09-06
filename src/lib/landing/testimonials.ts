export type TestimonialLang = 'en' | 'es' | 'pt';

export type Testimonial = {
  id: string;
  name: string;
  date: string;
  lang: TestimonialLang;
  original: string;
  translations: { en: string; pt: string; es: string; it: string };
};

export const TESTIMONIALS: Testimonial[] = [
  {
    id: 'eoin',
    name: 'Eoin',
    date: '2026-09-01',
    lang: 'en',
    original: 'Fantastic tutor. Really enjoying the lessons so far.',
    translations: {
      en: 'Fantastic tutor. Really enjoying the lessons so far.',
      pt: 'Tutor fantástico. Estou realmente gostando das aulas até agora.',
      es: 'Tutor fantástico. Estoy disfrutando mucho las clases hasta ahora.',
      it: 'Tutor fantastico. Sto apprezzando molto le lezioni finora.',
    },
  },
  {
    id: 'chunghwi',
    name: '충휘',
    date: '2026-08-10',
    lang: 'en',
    original: 'I was very satisfied with the class. The lesson was enjoyable and easy to follow. I would definitely recommend this class to others!',
    translations: {
      en: 'I was very satisfied with the class. The lesson was enjoyable and easy to follow. I would definitely recommend this class to others!',
      pt: 'Fiquei muito satisfeito com a aula. A lição foi agradável e fácil de seguir. Definitivamente recomendaria esta aula a outros!',
      es: 'Quedé muy satisfecho con la clase. Fue agradable y fácil de seguir. ¡La recomendaría!',
      it: 'Molto soddisfatto della lezione. Piacevole e facile da seguire. La consiglio!',
    },
  },
  {
    id: 'timothy',
    name: 'Timothy',
    date: '2026-08-07',
    lang: 'en',
    original: 'Really enjoying my lessons with Pedro so far. He is really patient and easygoing.',
    translations: {
      en: 'Really enjoying my lessons with Pedro so far. He is really patient and easygoing.',
      pt: 'Estou realmente gostando das minhas aulas com o Pedro até agora. Ele é muito paciente e tranquilo.',
      es: 'Disfruto mucho las clases con Pedro. Es muy paciente y cercano.',
      it: 'Mi sto godendo le lezioni con Pedro. È paziente e alla mano.',
    },
  },
  {
    id: 'kofi',
    name: 'Kofi',
    date: '2026-08-06',
    lang: 'en',
    original: 'Very early on into the classes, he has helped me gain my confidence in portuguese, a very fun, relatable, and patient teacher. I would recommend him to anybody',
    translations: {
      en: 'Very early on into the classes, he has helped me gain my confidence in portuguese, a very fun, relatable, and patient teacher. I would recommend him to anybody',
      pt: 'Desde o início das aulas, ele me ajudou a ganhar confiança em português, um professor muito divertido, compreensível e paciente. Eu o recomendaria para qualquer pessoa.',
      es: 'Desde el inicio me ayudó a ganar confianza en portugués. Divertido, cercano y paciente. Lo recomiendo.',
      it: 'Fin dall’inizio mi ha dato fiducia in portoghese. Divertente, empatico e paziente. Lo consiglio.',
    },
  },
  {
    id: 'skye',
    name: 'Skye',
    date: '2026-08-06',
    lang: 'en',
    original: 'Pedro delivers his lessons with humour, in a fun and lighthearted way. He really creates a relaxing environment for you to feel comfortable making mistakes, and isn\'t afraid to challenge your skills in order to keep progressing. Pedro is very patient and tailors lessons to your needs. Would definitely recommend :)',
    translations: {
      en: 'Pedro delivers his lessons with humour, in a fun and lighthearted way. He really creates a relaxing environment for you to feel comfortable making mistakes, and isn\'t afraid to challenge your skills in order to keep progressing. Pedro is very patient and tailors lessons to your needs. Would definitely recommend :)',
      pt: 'Pedro ministra suas aulas com humor, de uma maneira divertida e leve. Ele realmente cria um ambiente relaxante para você se sentir confortável ao cometer erros, e não tem medo de desafiar suas habilidades para continuar progredindo. Pedro é muito paciente e adapta as aulas às suas necessidades. Definitivamente recomendaria :)',
      es: 'Pedro da las clases con humor, de forma ligera. Crea un ambiente relajado para equivocarte y te reta para seguir avanzando. Muy paciente y adapta la clase. Lo recomiendo.',
      it: 'Pedro insegna con umorismo, in modo leggero. Crea un ambiente rilassato per sbagliare e ti sfida per progredire. Paziente e su misura. Lo consiglio.',
    },
  },
  {
    id: 'jeniffer',
    name: 'Jeniffer',
    date: '2026-07-30',
    lang: 'es',
    original: 'Muito bom! Como hispano hablante, recomiendo totalmente las clases con Pedro. Él se preocupa por preguntar tus necesidades y objetivos y adapta las clases a esto. Además, va evaluando tu avance y tu entendimiento, y con base en eso va preparando las siguientes clases. En lo particular he aprendido bastante durante el tiempo que llevo tomando clases con él. Recomiendo ampliamente.',
    translations: {
      en: 'Really good! As a Spanish speaker, I totally recommend classes with Pedro. He asks about your needs and goals and adapts the lessons. He also tracks your progress and understanding and prepares the next classes from that. I have learned a lot. Highly recommend.',
      pt: 'Muito bom! Como falante de espanhol, recomendo totalmente as aulas com Pedro. Ele se preocupa em perguntar suas necessidades e objetivos e adapta as aulas a isso. Além disso, vai avaliando seu progresso e seu entendimento, e com base nisso vai preparando as próximas aulas. Em particular, aprendi bastante durante o tempo que estou fazendo aulas com ele. Recomendo amplamente.',
      es: 'Muito bom! Como hispano hablante, recomiendo totalmente las clases con Pedro. Él se preocupa por preguntar tus necesidades y objetivos y adapta las clases a esto. Además, va evaluando tu avance y tu entendimiento, y con base en eso va preparando las siguientes clases. En lo particular he aprendido bastante durante el tiempo que llevo tomando clases con él. Recomiendo ampliamente.',
      it: 'Ottimo. Come ispanofona consiglio le lezioni con Pedro. Chiede obiettivi e adatta le classi, valuta i progressi e prepara le successive. Ho imparato tanto.',
    },
  },
  {
    id: 'ivan',
    name: 'Iván',
    date: '2026-07-29',
    lang: 'es',
    original: 'Me han gustado mucho las clases, están muy bien preparadas y estructuradas, cada minuto se aprovecha al máximo y aprendo mucho, el profesor es muy amable y paciente para enseñar.',
    translations: {
      en: 'I have really liked the classes. They are well prepared and structured, every minute is used, and I learn a lot. The teacher is kind and patient.',
      pt: 'Gostei muito das aulas, estão muito bem preparadas e estruturadas, cada minuto é aproveitado ao máximo e aprendo muito, o professor é muito gentil e paciente para ensinar.',
      es: 'Me han gustado mucho las clases, están muy bien preparadas y estructuradas, cada minuto se aprovecha al máximo y aprendo mucho, el profesor es muy amable y paciente para enseñar.',
      it: 'Le lezioni mi sono piaciute molto: preparate, strutturate, ogni minuto conta. Insegnante gentile e paziente.',
    },
  },
  {
    id: 'gabriel',
    name: 'Gabriel',
    date: '2026-07-22',
    lang: 'en',
    original: 'Pedro has been a great tutor so far. Exactly what I was looking for with full immersion and a plan catered to my speaking goals. Highly recommend',
    translations: {
      en: 'Pedro has been a great tutor so far. Exactly what I was looking for with full immersion and a plan catered to my speaking goals. Highly recommend',
      pt: 'Pedro tem sido um ótimo tutor até agora. Exatamente o que eu estava procurando, com imersão total e um plano adaptado aos meus objetivos de fala. Recomendo muito.',
      es: 'Pedro ha sido un gran tutor. Exactamente lo que buscaba: inmersión y un plan para hablar. Lo recomiendo.',
      it: 'Pedro è un ottimo tutor. Esattamente ciò che cercavo: immersione e un piano per parlare. Lo consiglio.',
    },
  },
  {
    id: 'maria',
    name: 'Maria',
    date: '2026-07-21',
    lang: 'en',
    original: 'Pedro is a great tutor! He is really friendly and encouraging. He’s always punctual, well prepared and has lots of interesting things to talk about.',
    translations: {
      en: 'Pedro is a great tutor! He is really friendly and encouraging. He’s always punctual, well prepared and has lots of interesting things to talk about.',
      pt: 'Pedro é um ótimo tutor! Ele é realmente amigável e encorajador. Ele está sempre pontual, bem preparado e tem muitas coisas interessantes para conversar.',
      es: 'Pedro es un gran tutor. Cercano y alentador. Puntual, preparado y con temas interesantes.',
      it: 'Pedro è un ottimo tutor. Gentile e incoraggiante. Puntuale, preparato e con argomenti interessanti.',
    },
  },
  {
    id: 'agustina',
    name: 'Agustina',
    date: '2026-07-21',
    lang: 'es',
    original: 'Desde el primer día Pedro fue súper amable y paciente. Dispuesto a adaptarse a lo que necesitaba! Recomiendo mucho sus clases para quienes precisan mas confianza o comenzar desde cero en portugués 🤗',
    translations: {
      en: 'From day one Pedro was super kind and patient. Willing to adapt to what I needed! I really recommend his classes for anyone who needs more confidence or to start Portuguese from zero.',
      pt: 'Desde o primeiro dia, Pedro foi super gentil e paciente. Disposto a se adaptar ao que eu precisava! Recomendo muito suas aulas para quem precisa de mais confiança ou começar do zero em português.',
      es: 'Desde el primer día Pedro fue súper amable y paciente. Dispuesto a adaptarse a lo que necesitaba! Recomiendo mucho sus clases para quienes precisan mas confianza o comenzar desde cero en portugués 🤗',
      it: 'Dal primo giorno Pedro è stato gentile e paziente. Si adatta a ciò che serve. Lo consiglio a chi parte da zero o vuole più fiducia.',
    },
  },
  {
    id: 'brennan',
    name: 'Brennan',
    date: '2026-07-20',
    lang: 'en',
    original: 'Every lesson with Pedro is great! He is very open and easy to talk to. I absolutely recommend him as a tutor!',
    translations: {
      en: 'Every lesson with Pedro is great! He is very open and easy to talk to. I absolutely recommend him as a tutor!',
      pt: 'Cada aula com o Pedro é ótima! Ele é muito aberto e fácil de conversar. Eu o recomendo absolutamente como tutor!',
      es: 'Cada clase con Pedro es genial. Es abierto y fácil de hablar. Lo recomiendo.',
      it: 'Ogni lezione con Pedro è ottima. Aperto e facile da parlare. Lo consiglio.',
    },
  },
  {
    id: 'khiabett',
    name: 'khiabett',
    date: '2026-07-20',
    lang: 'en',
    original: 'I highly recommend Pedro, He is a fantastic teacher who is always punctual and patient with my learning pace. He brings a great sense of humor to our lessons, which makes the material much easier to grasp and enjoy. Highly recommended.',
    translations: {
      en: 'I highly recommend Pedro, He is a fantastic teacher who is always punctual and patient with my learning pace. He brings a great sense of humor to our lessons, which makes the material much easier to grasp and enjoy. Highly recommended.',
      pt: 'Eu recomendo muito o Pedro. Ele é um professor fantástico que está sempre pontual e paciente com meu ritmo de aprendizagem. Ele traz um ótimo senso de humor às nossas aulas, o que torna o material muito mais fácil de entender e aproveitar. Altamente recomendado.',
      es: 'Recomiendo mucho a Pedro. Puntual y paciente con mi ritmo. El humor hace el material más fácil. Muy recomendable.',
      it: 'Consiglio Pedro. Puntuale e paziente. L’umorismo rende il materiale più facile. Consigliatissimo.',
    },
  },
  {
    id: 'bjorn',
    name: 'Björn',
    date: '2026-07-20',
    lang: 'en',
    original: 'Always having a great time with Pedro, he helps me a lot to deepen my confidence in speaking Portuguese. Can definitely recommend!',
    translations: {
      en: 'Always having a great time with Pedro, he helps me a lot to deepen my confidence in speaking Portuguese. Can definitely recommend!',
      pt: 'Sempre me divirto muito com o Pedro, ele me ajuda bastante a aprofundar minha confiança em falar português. Definitivamente recomendo!',
      es: 'Siempre paso un gran rato con Pedro. Me da más confianza para hablar. Lo recomiendo.',
      it: 'Con Pedro passo sempre un bel momento. Mi dà fiducia nel parlato. Lo consiglio.',
    },
  },
  {
    id: 'josep',
    name: 'Josep',
    date: '2026-06-24',
    lang: 'en',
    original: 'I’ve just had another Portuguese lesson with Pedro and I really enjoyed it. We always end up talking about interesting aspects of Brazil, which makes the class both enjoyable and very useful for expanding my vocabulary. Pedro is patient, friendly and easy to talk to, and he creates a relaxed atmosphere that really helps me speak more confidently. I would definitely recommend him to anyone learning Portuguese.',
    translations: {
      en: 'I’ve just had another Portuguese lesson with Pedro and I really enjoyed it. We always end up talking about interesting aspects of Brazil, which makes the class both enjoyable and very useful for expanding my vocabulary. Pedro is patient, friendly and easy to talk to, and he creates a relaxed atmosphere that really helps me speak more confidently. I would definitely recommend him to anyone learning Portuguese.',
      pt: 'Acabei de ter mais uma aula de português com o Pedro e realmente gostei. Sempre acabamos falando sobre aspectos interessantes do Brasil, o que torna a aula tanto agradável quanto muito útil para expandir meu vocabulário. Pedro é paciente, amigável e fácil de conversar, e ele cria uma atmosfera relaxada que realmente me ajuda a falar com mais confiança. Eu definitivamente o recomendaria a qualquer pessoa que esteja aprendendo português.',
      es: 'Acabo de tener otra clase con Pedro y la disfruté. Hablamos de Brasil, lo que amplía vocabulario. Paciente, cercano y con un ambiente relajado para hablar con más confianza. Lo recomiendo.',
      it: 'Ho appena fatto un’altra lezione con Pedro e mi è piaciuta. Parliamo del Brasile e allargo il vocabolario. Paziente, cordiale, atmosfera rilassata. Lo consiglio.',
    },
  },
  {
    id: 'barry',
    name: 'Barry',
    date: '2026-05-16',
    lang: 'pt',
    original: 'um professor excelente!',
    translations: {
      en: 'an excellent teacher!',
      pt: 'um professor excelente!',
      es: '¡un profesor excelente!',
      it: 'un insegnante eccellente!',
    },
  },
];

export const FEATURED_IDS = ['skye', 'jeniffer', 'josep'] as const;
export const ROW2_IDS = ['kofi', 'agustina', 'gabriel'] as const;
