module.exports = {
  async up(db, client) {
    await db.collection('applications').updateMany({}, { $set: { updates: [] } });
  },

  async down(db, client) {},
};
