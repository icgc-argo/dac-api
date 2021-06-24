import mjml2html from 'mjml';
import { Application } from '../domain/interface';
import handlerBars from 'handlebars';

const emailTemplte = `
<mjml>
<mj-body>
    <mj-section>
    <mj-column>
      <mj-text>
        Applicantion {{appId}} was submitted for Review !
      </mj-text>
    </mj-column>
  </mj-section>
</mj-body>
</mjml>
`;


export default function(data: Application) {
  const templateOutput = handlerBars.compile(emailTemplte)(data);
  const htmlOutput = mjml2html(templateOutput);
  if (htmlOutput.errors.length > 0) {
    console.error(`template errors ${JSON.stringify(htmlOutput.errors)}`);
    throw new Error('failed to generate email');
  }
  return htmlOutput.html;
}
