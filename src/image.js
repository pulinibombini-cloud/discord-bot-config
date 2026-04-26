export const IMAGES = {
  nycDay: [
    "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=1200&q=80",
    "https://images.unsplash.com/photo-1518391846015-55a9cc003b25?w=1200&q=80",
    "https://images.unsplash.com/photo-1534430480872-3498386e7856?w=1200&q=80",
    "https://images.unsplash.com/photo-1522083165195-3424ed129620?w=1200&q=80",
  ],
  nycNight: [
    "https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?w=1200&q=80",
    "https://images.unsplash.com/photo-1499092346589-b9b6be3e94b2?w=1200&q=80",
    "https://images.unsplash.com/photo-1546436836-07a91091f160?w=1200&q=80",
  ],
  money: [
    "https://images.unsplash.com/photo-1554672408-17407aa11ddb?w=1200&q=80",
    "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=1200&q=80",
    "https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=1200&q=80",
  ],
  invoice: [
    "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1200&q=80",
    "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1200&q=80",
  ],
  bank: [
    "https://images.unsplash.com/photo-1601597111158-2fceff292cdc?w=1200&q=80",
    "https://images.unsplash.com/photo-1565514020179-026b92b84bb6?w=1200&q=80",
  ],
  citizenship: [
    "https://images.unsplash.com/photo-1568598035424-7070b67317d2?w=1200&q=80",
    "https://images.unsplash.com/photo-1521295121783-8a321d551ad2?w=1200&q=80",
  ],
  event: ["https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&q=80"],
  news: ["https://images.unsplash.com/photo-1495020689067-958852a7765e?w=1200&q=80"],
  vote: ["https://images.unsplash.com/photo-1494172961521-33799ddd43a5?w=1200&q=80"],
  announcement: ["https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=1200&q=80"],
  warn: ["https://images.unsplash.com/photo-1605647540924-852290f6b0d5?w=1200&q=80"],
  ban: ["https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=1200&q=80"],
  mute: ["https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=1200&q=80"],
  dice: ["https://images.unsplash.com/photo-1606503153255-59d8b8b82176?w=1200&q=80"],
};

export const pickImage = (cat) => {
  const list = IMAGES[cat];
  return list[Math.floor(Math.random() * list.length)];
};
