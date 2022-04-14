module.exports = {
  async up(db, client) {
    await db.collection('applications').updateMany({}, { $unset: {'sections.terms': 1} });
  },

  async down(db, client) {},
};
