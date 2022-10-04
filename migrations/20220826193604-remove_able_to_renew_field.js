module.exports = {
  async up(db, client) {
    await db.collection('applications').updateMany({}, { $unset: { ableToRenew: 1 } });
  },

  async down(db, client) {},
};
