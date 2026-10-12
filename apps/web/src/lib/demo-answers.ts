// Evidence-grounded fallback answers (no LLM). Used in demo mode and when the model is unavailable.
// Numbers come only from the evaluation dataset for Electrician / Warangal; other trades say "no data".
type L = 'en' | 'te' | 'hi' | 'ta';
const SOURCE = 'Evaluation dataset (dummy) · illustrative figures, not official statistics';

const A: Record<string, Record<L, string>> = {
  income: {
    en: 'For Electrician in Warangal, the evaluation dataset shows a 78.4% placement rate and a starting salary of about ₹16,500 a month. This is a starting figure, not a promise, and I have no verified data on earnings after 3 years.',
    te: 'వరంగల్‌లో ఎలక్ట్రీషియన్‌కు మూల్యాంకన డేటా ప్రకారం ప్లేస్‌మెంట్ రేటు 78.4%, ప్రారంభ జీతం నెలకు సుమారు ₹16,500. ఇది ప్రారంభ అంచనా మాత్రమే, హామీ కాదు. 3 ఏళ్ల తర్వాత ఆదాయంపై ధృవీకరించిన డేటా నా వద్ద లేదు.',
    hi: 'वारंगल में इलेक्ट्रीशियन के लिए मूल्यांकन डेटा में प्लेसमेंट दर 78.4% और शुरुआती वेतन लगभग ₹16,500 प्रति माह है। यह शुरुआती आंकड़ा है, गारंटी नहीं। 3 साल बाद की कमाई का सत्यापित डेटा मेरे पास नहीं है।',
    ta: 'வாரங்கலில் எலக்ட்ரீஷியனுக்கு மதிப்பீட்டுத் தரவின்படி வேலைவாய்ப்பு விகிதம் 78.4%, தொடக்க ஊதியம் மாதம் சுமார் ₹16,500. இது தொடக்க அளவு மட்டுமே, உறுதிமொழி அல்ல. 3 ஆண்டுகளுக்குப் பிறகான வருமானத் தரவு என்னிடம் இல்லை.',
  },
  safety: {
    en: 'Electrical work has real risks, such as live current and working at height. Good training covers safety practice and protective equipment. I have no verified injury or insurance data, so please ask the centre what safety training and cover it provides, or I can connect you to a counsellor.',
    te: 'విద్యుత్ పనిలో కరెంట్ షాక్, ఎత్తులో పని వంటి నిజమైన ప్రమాదాలు ఉంటాయి. మంచి శిక్షణలో భద్రతా పద్ధతులు, రక్షణ పరికరాలు ఉంటాయి. గాయాలు, బీమాపై ధృవీకరించిన డేటా నా వద్ద లేదు; కేంద్రాన్ని అడగండి లేదా కౌన్సిలర్‌తో మాట్లాడండి.',
    hi: 'बिजली के काम में करंट और ऊँचाई पर काम जैसे वास्तविक जोखिम होते हैं। अच्छे प्रशिक्षण में सुरक्षा अभ्यास और सुरक्षा उपकरण शामिल होते हैं। चोट या बीमा का सत्यापित डेटा मेरे पास नहीं है; केंद्र से पूछें या काउंसलर से बात करें।',
    ta: 'மின் வேலையில் மின்தாக்கம், உயரத்தில் வேலை போன்ற உண்மையான ஆபத்துகள் உள்ளன. நல்ல பயிற்சியில் பாதுகாப்பு நடைமுறைகளும் உபகரணங்களும் அடங்கும். காயம், காப்பீடு பற்றிய சரிபார்க்கப்பட்ட தரவு என்னிடம் இல்லை; மையத்திடம் கேளுங்கள் அல்லது ஆலோசகரிடம் பேசுங்கள்.',
  },
  degree: {
    en: 'Both routes are respected and it is not either/or. Vocational qualifications sit on the NSQF ladder, which is designed to let learners move on to further study later. I have no verified progression data for this trade yet, so a counsellor can walk your family through the options.',
    te: 'రెండు మార్గాలూ గౌరవనీయమైనవే, ఇది ఒకటి లేదా మరొకటి కాదు. వృత్తి విద్య అర్హతలు NSQF నిచ్చెనపై ఉంటాయి; తర్వాత ఉన్నత చదువులకు వెళ్లేలా దీన్ని రూపొందించారు. ఈ ట్రేడ్‌కు ధృవీకరించిన డేటా ఇంకా లేదు; కౌన్సిలర్ మీ కుటుంబానికి వివరిస్తారు.',
    hi: 'दोनों रास्ते सम्मानित हैं, यह एक या दूसरा चुनने जैसा नहीं है। व्यावसायिक योग्यताएँ NSQF सीढ़ी पर होती हैं, जो आगे की पढ़ाई का रास्ता खुला रखती है। इस ट्रेड का सत्यापित डेटा अभी नहीं है; काउंसलर आपके परिवार को विकल्प समझा सकते हैं।',
    ta: 'இரண்டு வழிகளும் மதிப்புமிக்கவை, ஒன்றா மற்றொன்றா என்பதில்லை. தொழிற்கல்வித் தகுதிகள் NSQF படிநிலையில் உள்ளன; பின்னர் உயர்கல்விக்குச் செல்ல இது வழிவகுக்கும். இந்தத் தொழிலுக்கான சரிபார்க்கப்பட்ட தரவு இன்னும் இல்லை; ஆலோசகர் உங்கள் குடும்பத்திற்கு விளக்குவார்.',
  },
  status: {
    en: 'Many families worry about how a trade is seen, and that concern is fair. I have no verified data on social perception, so I will not claim more than I know. A counsellor can talk this through with you and your family.',
    te: 'ఒక వృత్తిని సమాజం ఎలా చూస్తుందనే ఆందోళన చాలా కుటుంబాలకు ఉంటుంది, అది సహజమే. సామాజిక అభిప్రాయంపై ధృవీకరించిన డేటా లేదు, కాబట్టి తెలియనిది చెప్పను. కౌన్సిలర్ మీతో, మీ కుటుంబంతో మాట్లాడగలరు.',
    hi: 'कई परिवारों को चिंता रहती है कि समाज किसी ट्रेड को कैसे देखता है, और यह चिंता जायज़ है। सामाजिक धारणा का सत्यापित डेटा मेरे पास नहीं है, इसलिए जो नहीं जानता वह नहीं कहूँगा। काउंसलर आपसे और आपके परिवार से बात कर सकते हैं।',
    ta: 'ஒரு தொழிலை சமூகம் எப்படிப் பார்க்கிறது என்ற கவலை பல குடும்பங்களுக்கு உண்டு, அது நியாயமே. சமூகப் பார்வை பற்றிய சரிபார்க்கப்பட்ட தரவு இல்லை, தெரியாததைச் சொல்ல மாட்டேன். ஆலோசகர் உங்களுடனும் குடும்பத்துடனும் பேசலாம்.',
  },
  default: {
    en: 'I can answer questions about earnings, safety, degree versus vocational routes and social standing, using only verified evidence. For anything else I can connect you to a human counsellor.',
    te: 'సంపాదన, భద్రత, డిగ్రీ vs వృత్తి విద్య, సామాజిక గౌరవం గురించి ధృవీకరించిన ఆధారాలతో మాత్రమే సమాధానం ఇస్తాను. మిగిలిన వాటికి కౌన్సిలర్‌తో మాట్లాడించగలను.',
    hi: 'मैं कमाई, सुरक्षा, डिग्री बनाम व्यावसायिक रास्ता और सामाजिक सम्मान पर केवल सत्यापित प्रमाणों से जवाब दे सकता हूँ। बाकी के लिए काउंसलर से जोड़ सकता हूँ।',
    ta: 'வருமானம், பாதுகாப்பு, பட்டம் vs தொழிற்கல்வி, சமூக மதிப்பு பற்றி சரிபார்க்கப்பட்ட சான்றுகளுடன் மட்டுமே பதிலளிப்பேன். மற்றவற்றுக்கு ஆலோசகருடன் இணைக்கிறேன்.',
  },
  nodata: {
    en: 'I have no verified outcome data for this trade yet, so I will not guess. I can connect you with a human counsellor.',
    te: 'ఈ ట్రేడ్‌కు ధృవీకరించిన ఫలిత డేటా ఇంకా లేదు, అందుకే ఊహించను. కౌన్సిలర్‌తో మాట్లాడించగలను.',
    hi: 'इस ट्रेड का सत्यापित परिणाम डेटा अभी नहीं है, इसलिए अनुमान नहीं लगाऊँगा। काउंसलर से जोड़ सकता हूँ।',
    ta: 'இந்தத் தொழிலுக்கான சரிபார்க்கப்பட்ட முடிவுத் தரவு இன்னும் இல்லை, ஊகிக்க மாட்டேன். ஆலோசகருடன் இணைக்கிறேன்.',
  },
};

const INTENTS: Array<[string, RegExp]> = [
  ['income', /salary|earn|income|wage|pay|money|జీతం|సంపాద|ఆదాయం|वेतन|कमाई|आय|ஊதிய|சம்பள|வருமான/i],
  ['safety', /safe|danger|risk|accident|shock|సురక్ష|భద్రత|ప్రమాద|सुरक्ष|खतरा|जोखिम|பாதுகாப்பு|ஆபத்து/i],
  ['degree', /degree|college|study|university|diploma|డిగ్రీ|చదువు|डिग्री|कॉलेज|पढ़ाई|பட்டம்|கல்லூரி/i],
  ['status', /status|respect|society|neighbo|shame|prestige|గౌరవ|సమాజ|सम्मान|समाज|इज्जत|மதிப்பு|சமூக/i],
];

export function evidenceReply(text: string, lang: string, tradeId?: number) {
  const l = (['en', 'te', 'hi', 'ta'].includes(lang) ? lang : 'en') as L;
  const hasData = tradeId === 1; // only Electrician (Warangal) has evaluation data
  const intent = INTENTS.find(([, re]) => re.test(text))?.[0];
  if (!hasData && (intent === 'income' || intent === 'degree' || intent === 'safety')) {
    return { reply: A.nodata[l], citations: [] as string[], suggested_chips: ['Talk to a counsellor'], escalate: false };
  }
  const key = intent || 'default';
  const evidence = hasData && intent === 'income';
  return {
    reply: A[key][l],
    citations: evidence ? [SOURCE] : [],
    suggested_chips: ['Talk to a counsellor'],
    escalate: false,
  };
}
