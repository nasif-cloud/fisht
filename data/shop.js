// Shop inventory. Add another item here and it will appear in the next
// available shop image slot and in the /buy item choices automatically.
module.exports = [
  {
    id: 'reset_token',
    name: 'Meat',
    aliases: ['meat', 'reset token', 'reset_token', 'token'],
    price: 2500,
    inventoryField: 'meat',
    amountPerPurchase: 1
  },
  {
    id: 'chest',
    name: 'Chest',
    aliases: ['chests'],
    price: 5000,
    inventoryField: 'chests',
    amountPerPurchase: 1
  },
  {
    id: 'wine',
    name: 'Wine',
    aliases: [],
    price: 500,
    inventoryField: 'wine',
    amountPerPurchase: 1
  },
  {
    id: 'beer',
    name: 'Beer',
    aliases: [],
    price: 3000,
    inventoryField: 'beer',
    amountPerPurchase: 1
  },
  {
    id: 'crate',
    name: 'Crate',
    aliases: ['crates'],
    price: 5000,
    inventoryField: 'crates',
    amountPerPurchase: 1
  },
  {
    id: 'gem',
    name: 'Gem',
    aliases: ['gems'],
    price: 2500,
    inventoryField: 'gems',
    amountPerPurchase: 1
  },
  {
    id: 'random_clone',
    name: 'Random Clone',
    aliases: ['random clones', 'randomclone'],
    price: 1000,
    type: 'random_clone'
  }
];