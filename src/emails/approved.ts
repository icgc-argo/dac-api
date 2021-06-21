import { text } from './common';

function content() {
  const message = `
    ${text(`Based upon the information provided in the following application, you have been granted access to ICGC Controlled Data for 1 year. <strong>Kindly note, it may take up to 24 hours for authorization to take effect.</strong>`)}
    ${text(`Please note that access to ICGC Controlled Data remains conditional upon respecting the terms and conditions of the Data Access Agreement, particularly regarding (but not limited to) the publication moratorium and re-identification of research participants.`)}
  `;
}


function actionButton() {
  return `
  <mj-section padding="0 15px 0 0px" background-color="#F6F6F7" border="1px solid #DCDDE1">
    <mj-column width="50%" padding="13px 0px 13px 18px">
      <mj-text color="#0774D3"
              padding="0px 0px 0px 0px"
              font-size="13px"
              font-weight="bold"
              >
        You can manage collaborators or add a new ethics letter at any time:
      </mj-text>
    </mj-column>
    <mj-column width="50%" padding="13px 0px 13px 0px">
      <mj-button background-color="#7F55CC"
                text-transform="uppercase"
                color="#ffffff"
                font-size="12px"
                font-weight="bold"
                font-style="normal"
                href="https://google.com"
                border-radius="0px"
                inner-padding="16px 24px"
                padding="0px 0px 0px 0px">
        View your Application
      </mj-button>
    </mj-column>
  </mj-section>
  `;
}