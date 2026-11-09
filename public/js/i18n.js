// Interface text in Vietnamese and English. Temple terms (lạy, thắp nhang, ...) stay
// Vietnamese in both. Static HTML uses data-i18n="key"; scripts call t('key', {vars}).

const S = {
  en: {
    sub: 'Chùa trên núi · open day and night', visiting: 'visiting', here: 'in this courtyard', incenseToday: 'Incense today',
    leaves: 'lá bồ đề', gifts: 'gifts', bagTitle: 'Túi phước', bagText: 'Good deeds earn Bodhi leaves. Every 12 leaves, the temple gives you a gift.',
    noGifts: 'No gifts yet. Light incense, ring the bell, pray in a hall, sweep leaves or talk with a monk.',
    scene: 'Scene', time: 'Time of day', followClock: 'Follow my clock', pixel: 'Pixel size', visitors: 'Visitors', smoke: 'Incense smoke',
    smokeOff: 'Off', smokeLittle: 'A little', smokeFull: 'Full', quality: 'Graphics', qAuto: 'Auto', qLow: 'Low', qHigh: 'High',
    volume: 'Volume', volAll: 'All sound', volNature: 'Nature', volTemple: 'Bells and chanting', reduceMotion: 'Reduce motion', language: 'Language',
    enterTitle: 'Enter the temple', yourName: 'Your name', clothing: 'Clothing', colour: 'Colour', everyday: 'Everyday', walkIn: 'Enter',
    welcome: 'Welcome, {name}', kStand: 'Stand', kBow: 'Xá (bow)', kKneel: 'Quỳ (kneel)', kSit: 'Thiền (sit)', kIncense: 'Incense', kBell: 'Ring bell',
    kHelp: 'Help out', kEye: 'Eye view', kDay: 'Day / night', kChat: 'Chat', kHalls: 'Halls', kCandle: 'Candle', kWish: 'Wish', kFortune: 'Xin xăm',
    invite: 'Invite friends', inviteCopied: 'Invite link copied. Friends who open it join your courtyard.',
    alone: 'Visiting on your own', connecting: 'Connecting…', live: 'Live · {n} here',
    nameErr: 'Please choose another name: 2 to 18 letters, no rude words, not a monk or staff title.',
    enterFirst: 'Walk through the gate. Every hall has stairs and a Buddha inside. Good deeds earn Bodhi leaves.',
    hintIncense: 'Press F to light incense (thắp nhang)', hintBell: 'Press B to ring the bell (thỉnh chuông)', hintSweep: 'Press G to sweep the fallen leaves',
    hintDog: 'Press G to give the temple dog some water', hintKneel: 'Press 4 to kneel and pray, 5 to bow down (lạy)', hintCandle: 'Press C to offer a candle (thắp nến)',
    hintWish: 'Press T to hang a wish on the Bodhi tree', hintFortune: 'Press X to draw a fortune stick (xin xăm)',
    incenseLit: 'Incense lit. Make your wish, then it goes into the urn.', incenseFar: 'Walk to the bronze incense urn (lư hương) in the courtyard to light incense.',
    bellFar: 'The bell is to the right of the urn. Walk next to it and press B.', helpFar: 'Find a pile of fallen leaves to sweep, or give the temple dog some water.',
    dogWag: 'The temple dog wags its tail.', lay: 'Lạy: kneeling bows. Press 1 to stand up.', eyeView: 'Eye view. Drag to look around, scroll out or press V to leave.',
    hallEnter: '{hall} · {deity}. Press 4 to kneel and pray.', allHalls: 'You have visited every hall. A Di Đà Phật.', giftGot: 'Nhà chùa tặng bạn: {gift}',
    bigBell: 'Đại hồng chung · the great bell rings for the {when}', morning: 'dawn', evening: 'evening',
    arrived: 'came in',
    stallFreeSay: 'Stall keeper: "This stall is free. Want to open a shop here?"', stallFreeTitle: 'This stall is free',
    stallFreeText: 'Nobody rents this stall yet. Open your own shop here for {price} a month: your name, logo, website and menu for every visitor who walks by.',
    stallRent: 'Rent this stall', stallNo: 'Not now', stallHeld: 'Someone is renting this stall right now.', stallVisit: 'Visit the shop', stallMenu: 'Menu',
    chatPlaceholder: 'Say something kind… (Enter to send)', chatSlow: 'Slow down a little.', mute: 'Mute', unmute: 'Unmute', report: 'Report',
    reported: 'Thank you. The temple will look at this.', reportWhy: 'What happened?',
    hallsTitle: 'Go to a hall', hallsText: 'Walk there yourself, or go straight to the hall door.',
    candleTitle: 'Thắp nến', candleText: 'Offer a candle. It burns at the candle stand for 24 hours, for everyone to see, and glows at night.',
    candleName: 'Name on the candle', candleWish: 'Your wish (optional)', candleSize: 'Candle', small: 'Small', medium: 'Medium', large: 'Large',
    candleOrder: 'Show the QR code', candleScan: 'Scan with your banking app, or transfer by hand with this exact memo:', candleBank: 'Bank', candleAccount: 'Account',
    candleHolder: 'Account name', candleAmount: 'Amount', candleMemo: 'Memo', candleWait: 'Waiting for your transfer… This window updates by itself.',
    candlePaid: 'Your candle is lit. A Di Đà Phật.', candleExpired: 'This order expired. Start a new one if you still want to offer a candle.',
    candleOff: 'Candle offerings are not open yet.', candleSimulate: 'Simulate payment (test mode)', candleDonations: 'See all offerings', burning: '{n} candles burning',
    wishTitle: 'Treo ý nguyện', wishText: 'Hang a wish on the Bodhi tree. Kind wishes appear for everyone; others wait for the temple to read them.',
    wishPlaceholder: 'Nguyện cho…', wishSend: 'Hang my wish', wishThanks: 'Your wish hangs on the Bodhi tree.', wishPending: 'Thank you. The temple will read your wish before it appears.',
    wishEmpty: 'No wishes yet. Be the first.', close: 'Close', fortuneTitle: 'Xin xăm', fortuneShake: 'Shaking the cup… focus your heart', fortuneStick: 'Stick number {n}',
    fortuneNote: 'Just for fun. Being kind is the best fortune there is.',
    fortuneAsk: 'The fortune teller: "Come, shake the cup with a sincere heart. Love, money or deadlines, ask away."',
    fortuneDraw: 'Draw a stick', fortuneAgain: 'Draw another', fortuneShakeAgain: 'Shake again',
    keoUp: 'You toss the moon blocks: both land face down. The gods say "ask nicely". Shake again.',
    keoDown: 'You toss the moon blocks: both land face up. The gods are laughing, no answer yet. Shake again.',
    fortuneLove: 'Love', fortuneMoney: 'Money', fortuneWork: 'Work and study', lowered: 'Graphics lowered to keep things smooth.',
    offline: 'Saved in this browser only.',
    candleFar: 'The candle stand is near the Bodhi tree, left of the urn. Walk next to it and press C.',
    wishFar: 'The wishing tree is the big Bodhi tree on the left of the courtyard. Walk under it and press T.',
    fortuneFar: 'The XIN XĂM stall is in the courtyard, behind the incense urn. Walk up to it and press X.',
    needServer: 'This needs the temple server, which is not reachable right now.',
  },
  vi: {
    sub: 'Chùa trên núi · mở cửa ngày đêm', visiting: 'đang viếng', here: 'ở sân này', incenseToday: 'Nhang hôm nay',
    leaves: 'lá bồ đề', gifts: 'quà', bagTitle: 'Túi phước', bagText: 'Việc thiện được tặng lá bồ đề. Cứ 12 lá, nhà chùa tặng bạn một món quà.',
    noGifts: 'Chưa có quà. Hãy thắp nhang, thỉnh chuông, lễ Phật, quét lá hoặc trò chuyện với thầy.',
    scene: 'Cảnh', time: 'Giờ trong ngày', followClock: 'Theo giờ của tôi', pixel: 'Cỡ điểm ảnh', visitors: 'Khách viếng', smoke: 'Khói nhang',
    smokeOff: 'Tắt', smokeLittle: 'Một chút', smokeFull: 'Đầy đủ', quality: 'Đồ họa', qAuto: 'Tự động', qLow: 'Thấp', qHigh: 'Cao',
    volume: 'Âm lượng', volAll: 'Tất cả', volNature: 'Thiên nhiên', volTemple: 'Chuông và tụng kinh', reduceMotion: 'Giảm chuyển động', language: 'Ngôn ngữ',
    enterTitle: 'Vào chùa', yourName: 'Tên của bạn', clothing: 'Trang phục', colour: 'Màu', everyday: 'Thường ngày', walkIn: 'Vào chùa',
    welcome: 'Chào {name}', kStand: 'Đứng', kBow: 'Xá', kKneel: 'Quỳ', kSit: 'Thiền', kIncense: 'Thắp nhang', kBell: 'Thỉnh chuông',
    kHelp: 'Giúp chùa', kEye: 'Góc nhìn mắt', kDay: 'Ngày / đêm', kChat: 'Trò chuyện', kHalls: 'Các điện', kCandle: 'Thắp nến', kWish: 'Ý nguyện', kFortune: 'Xin xăm',
    invite: 'Mời bạn bè', inviteCopied: 'Đã chép đường dẫn. Bạn bè mở nó sẽ vào cùng sân với bạn.',
    alone: 'Đang viếng một mình', connecting: 'Đang kết nối…', live: 'Trực tuyến · {n} người',
    nameErr: 'Vui lòng chọn tên khác: 2 đến 18 chữ, không thô tục, không dùng danh xưng của thầy hay nhà chùa.',
    enterFirst: 'Đi qua cổng tam quan. Điện nào cũng có bậc thang và tượng Phật. Việc thiện được tặng lá bồ đề.',
    hintIncense: 'Bấm F để thắp nhang', hintBell: 'Bấm B để thỉnh chuông', hintSweep: 'Bấm G để quét lá', hintDog: 'Bấm G để cho chó chùa uống nước',
    hintKneel: 'Bấm 4 để quỳ lễ, 5 để lạy', hintCandle: 'Bấm C để thắp nến', hintWish: 'Bấm T để treo ý nguyện lên cây bồ đề', hintFortune: 'Bấm X để xin xăm',
    incenseLit: 'Đã thắp nhang. Hãy nguyện cầu, rồi cắm nhang vào lư.', incenseFar: 'Hãy đến lư hương bằng đồng giữa sân để thắp nhang.',
    bellFar: 'Chuông ở bên phải lư hương. Đến gần rồi bấm B.', helpFar: 'Tìm đống lá rụng để quét, hoặc cho chó chùa uống nước.',
    dogWag: 'Chó chùa vẫy đuôi.', lay: 'Lạy: quỳ và cúi lạy. Bấm 1 để đứng dậy.', eyeView: 'Góc nhìn mắt. Kéo để nhìn quanh, cuộn ra hoặc bấm V để thoát.',
    hallEnter: '{hall} · {deity}. Bấm 4 để quỳ lễ.', allHalls: 'Bạn đã viếng tất cả các điện. A Di Đà Phật.', giftGot: 'Nhà chùa tặng bạn: {gift}',
    bigBell: 'Đại hồng chung · chuông {when}', morning: 'sáng', evening: 'chiều',
    arrived: 'đã vào chùa',
    stallFreeSay: 'Cô bán hàng: "Sạp này còn trống đó. Con có muốn mở sạp ở đây không?"', stallFreeTitle: 'Sạp này còn trống',
    stallFreeText: 'Sạp này chưa có ai thuê. Mở sạp của bạn ở đây với {price} một tháng: tên, logo, trang web và thực đơn hiện cho mọi khách đi ngang.',
    stallRent: 'Thuê sạp này', stallNo: 'Để sau', stallHeld: 'Sạp này đang có người làm thủ tục thuê.', stallVisit: 'Ghé trang của sạp', stallMenu: 'Thực đơn',
    chatPlaceholder: 'Nói điều tử tế… (Enter để gửi)', chatSlow: 'Chậm lại một chút nhé.', mute: 'Tắt tiếng', unmute: 'Bật tiếng', report: 'Báo cáo',
    reported: 'Cảm ơn bạn. Nhà chùa sẽ xem xét.', reportWhy: 'Chuyện gì đã xảy ra?',
    hallsTitle: 'Đến một điện', hallsText: 'Tự đi bộ đến, hoặc đến thẳng cửa điện.',
    candleTitle: 'Thắp nến', candleText: 'Dâng một ngọn nến. Nến cháy trên giá nến 24 giờ, mọi người đều thấy, và sáng lên khi trời tối.',
    candleName: 'Tên trên nến', candleWish: 'Ý nguyện (không bắt buộc)', candleSize: 'Nến', small: 'Nhỏ', medium: 'Vừa', large: 'Lớn',
    candleOrder: 'Hiện mã QR', candleScan: 'Quét bằng ứng dụng ngân hàng, hoặc chuyển khoản với đúng nội dung này:', candleBank: 'Ngân hàng', candleAccount: 'Số tài khoản',
    candleHolder: 'Chủ tài khoản', candleAmount: 'Số tiền', candleMemo: 'Nội dung', candleWait: 'Đang chờ chuyển khoản… Cửa sổ này tự cập nhật.',
    candlePaid: 'Nến của bạn đã được thắp. A Di Đà Phật.', candleExpired: 'Đơn này đã hết hạn. Hãy tạo đơn mới nếu bạn vẫn muốn thắp nến.',
    candleOff: 'Chưa mở dâng nến.', candleSimulate: 'Giả lập thanh toán (chế độ thử)', candleDonations: 'Xem công đức', burning: '{n} ngọn nến đang cháy',
    wishTitle: 'Treo ý nguyện', wishText: 'Treo ý nguyện lên cây bồ đề. Lời nguyện tốt lành hiện ngay; lời khác chờ nhà chùa đọc trước.',
    wishPlaceholder: 'Nguyện cho…', wishSend: 'Treo ý nguyện', wishThanks: 'Ý nguyện của bạn đã treo trên cây bồ đề.', wishPending: 'Cảm ơn bạn. Nhà chùa sẽ đọc trước khi hiện.',
    wishEmpty: 'Chưa có ý nguyện. Hãy là người đầu tiên.', close: 'Đóng', fortuneTitle: 'Xin xăm', fortuneShake: 'Đang lắc ống xăm… thành tâm nha', fortuneStick: 'Xăm số {n}',
    fortuneNote: 'Xăm vui thôi nha. Sống tử tế mới là quẻ xịn nhất.',
    fortuneAsk: 'Thầy giải xăm: "Lại đây con, lắc ống xăm cho thành tâm. Tình duyên, tiền bạc hay deadline, hỏi gì cũng được."',
    fortuneDraw: 'Xin xăm', fortuneAgain: 'Xin quẻ nữa', fortuneShakeAgain: 'Lắc lại',
    keoUp: 'Gieo keo: hai keo cùng úp. Thần bảo "hỏi lại cho tử tế coi". Lắc lại nha.',
    keoDown: 'Gieo keo: hai keo cùng ngửa. Thần đang cười, chưa chịu trả lời. Lắc lại nha.',
    fortuneLove: 'Tình duyên', fortuneMoney: 'Tiền bạc', fortuneWork: 'Công việc & học hành', lowered: 'Đã giảm đồ họa để chạy mượt hơn.',
    offline: 'Chỉ lưu trên trình duyệt này.',
    candleFar: 'Giá nến ở gần cây bồ đề, bên trái lư hương. Đến gần rồi bấm C.',
    wishFar: 'Cây ý nguyện là cây bồ đề lớn bên trái sân. Đứng dưới tán cây rồi bấm T.',
    fortuneFar: 'Sạp XIN XĂM ở giữa sân, phía sau lư hương. Đến gần rồi bấm X.',
    needServer: 'Việc này cần máy chủ của chùa, hiện chưa kết nối được.',
  },
};

let lang = 'vi';
try { lang = localStorage.getItem('antam-lang') || 'vi'; } catch (e) { /* storage blocked */ }
if (!S[lang]) lang = 'vi';

export function getLang() { return lang; }

export function setLang(l) {
  lang = S[l] ? l : 'en';
  try { localStorage.setItem('antam-lang', lang); } catch (e) { /* storage blocked */ }
  applyStatic();
}

export function t(key, vars = {}) {
  const s = S[lang][key] ?? S.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

export function applyStatic(root = document) {
  document.documentElement.lang = lang;
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
}
