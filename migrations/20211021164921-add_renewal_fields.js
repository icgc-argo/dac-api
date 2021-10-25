module.exports = {
  async up(db, client) {
    await db
      .collection('applications')
      .find({})
      .forEach(function (doc) {
        db.collection('applications').update(
          { _id: doc._id },
          { $set: { isRenewal: false, ableToRenew: false }, $push: { searchValues: 'NEW' } },
        );
      });
  },

  async down(db, client) {},
};
