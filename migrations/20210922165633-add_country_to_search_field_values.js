module.exports = {
  async up(db, client) {
    await db
      .collection('applications')
      .find({})
      .forEach(function (doc) {
        const country = doc.sections.applicant.address.country;
        if (country.length > 0) {
          db.collection('applications').update(
            { _id: doc._id },
            { $push: { searchValues: country } },
          );
        }
      });
  },

  async down(db, client) {},
};
