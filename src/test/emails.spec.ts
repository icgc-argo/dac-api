import mjml2html from 'mjml';
import renderSubmitted from '../emails/submitted';
import handlerBars from 'handlebars';

import nodemail from 'nodemailer';
import { getAppInReview } from './state.spec';
describe('emails', () => {
  // manual test not to be automated
  it.skip('test render with handle bars', async () => {
    const emailTemplte = `
    <mjml>
    <mj-head>
      <mj-font name="Raleway" href="https://fonts.googleapis.com/css?family=Raleway" />
    </mj-head>
    <mj-body>
      <mj-section>
        <mj-column>
          <mj-text font-family="Raleway, Arial">
            Hello World!
          </mj-text>
        </mj-column>
      </mj-section>
    </mj-body>
  </mjml>
    `;

    const templateOutput = handlerBars.compile(emailTemplte)({
      range: [{ n: 1}, {n: 2}, {n: 3}]
    });

    console.log(templateOutput);
    const htmlOutput = mjml2html(templateOutput);
    if (htmlOutput.errors.length > 0) {
      throw new Error(`failed to generate email ${JSON.stringify(htmlOutput.errors)}`);
    }
    console.log(htmlOutput.html);

    const transporter = nodemail.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: '@gmail.com',
        pass: '',
      }
    } as any);

    const info = await transporter.sendMail({
      from: '"Fred Foo 👻" <test@example.com>', // sender address
      to: '@example.com', // list of receivers
      subject: 'Hello ✔', // Subject line
      text: 'Hello world?', // plain text body
      html: htmlOutput.html, // html body
    });
    return info;
  });

  describe('email rendering', () => {
    it.only('should render submission email', () => {
      const app = getAppInReview();
      const email = renderSubmitted(app);
      console.log(email.emailMjml);
    });
  });
});