import { Application } from '../domain/interface';

const defaultTextStyle = {
  color: '#000000',
  'font-size': '14px',
  'padding': '0'
};
export function compose(cardData: {
  receiver: Receiver,
  message: string,
}, title: string) {
  return `
    <mjml>
      ${header(title)}
      ${body(title, cardData.receiver, cardData.message)}
    </mjml>
  `;
}

function header(title: string) {
  return `
    <mj-head>
      <mj-title>${title}</mj-title>
      <mj-font name="Work Sans" href="https://fonts.googleapis.com/css?family=Work Sans"></mj-font>
      <mj-preview>Pre-header Text</mj-preview>
      <mj-attributes>
        <mj-all font-family="'Work Sans', Helvetica, Arial, sans-serif"></mj-all>
        <mj-text font-weight="400" font-size="16px" color="#000000" line-height="24px" font-family="'Work Sans', Helvetica, Arial, sans-serif"></mj-text>
      </mj-attributes>
      <mj-style inline="inline">
        .body {
          min-width: 400px;
        }
        .body-section {
          -webkit-box-shadow: 1px 4px 11px 0px rgba(0, 0, 0, 0.15);
          -moz-box-shadow: 1px 4px 11px 0px rgba(0, 0, 0, 0.15);
          box-shadow: 1px 4px 11px 0px rgba(0, 0, 0, 0.15);
        }
        .app-tbl-lable {
          font-weight: bold;
          width:130px;
          padding-top: 4px;
          padding-left: 10px;
          padding-bottom: 4px;
          font-size:14px;
          color: #000;
          min-width: 130px;
        }
        .app-tbl-val {
          font-size: 14px;
          color: #0774d3;
          font-weight: bold;
          min-width: 120px;
        }
        .app-tbl-icon {
          width: 50px;
         height: 50px;
        }
        .text-link {
          color: #523785;
        }
        .footer-link {
          color: 523785;
        }
      </mj-style>
    </mj-head>
  `;
}

function body(subject: string, receiver: Receiver, content: string ) {
  return `
    <mj-body background-color="#ffffff" width="600px" css-class="body">
      ${banner()}
      ${card(subject, receiver, content)}
      ${footer()}
    </mj-body>
  `;
}

function banner() {
  return `
  <mj-section full-width="full-width" background-color="#ffffff" padding-bottom="0">
    <mj-column width="100%">
      <mj-image src="" alt="ICGC ARGO LOGO" align="center" width="150px" />
      <mj-text color="#ffffff" font-weight="bold" align="center" text-transform="uppercase" font-size="12px" letter-spacing="1px" padding-top="30px" padding-bottom="30px">
        <a href="https://daco.icgc-argo.org/">ICGC DATA ACCESS COMPLIANCE OFFICE</a>
      </mj-text>
    </mj-column>
  </mj-section>
  `;
}

function card(subject: string, receiver: Receiver, message: string) {
  return `
    ${cardHeader(subject)}
    ${cardBody(receiver, message)}
  `;
}

function cardHeader(title: string) {
  return `
    <mj-section background-color="#0774D3">
      <mj-column width="100%">
        <mj-text color="#ffffff" font-weight="bold" align="center" font-size="20px" padding="0"  background-color="#0774D3">
          ${title}
        </mj-text>
      </mj-column>
    </mj-section>
  `;
}

function cardBody(receiver: Receiver, message: string) {
  return `
    <mj-wrapper padding="30px 32px 52px 32px" css-class="body-section">
      ${greeting(receiver)}
      ${message}
      ${closure()}
    </mj-wrapper>
  `;
}

type Receiver = {
  title?: string,
  first: string,
  last: string,
  suffix?: string
};

function greeting(args: Receiver) {
  return `
    <mj-section padding="0">
      <mj-column padding="0">
      ${text(
        `Dear ${args.title ? args.title + ' ' : '' }${args.first} ${args.last}${args.suffix ? ' ' + args.suffix : ''},`
      , { ...defaultTextStyle,  padding: '0px 0px 20px 0px' })}
      </mj-column>
    </mj-section>
  `;
}

export function appInfoBox(app: Application) {
  const applicantInfo = app.sections.applicant.info;
  const applicantName =
    `${applicantInfo.title ? applicantInfo.title + ' ' : '' }${applicantInfo.firstName} ${applicantInfo.lastName}${applicantInfo.suffix ? ' ' + applicantInfo.suffix : ''}`;

  return `
    <mj-section padding="0px 0px 20px 0px">
      <mj-column border="1px #dcdde1 solid" padding="0" >
        <mj-table font-weight="400"
                  font-size="16px"
                  color="#000000"
                  padding="10px 16px"
                  line-height="24px"
                  font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" >
                  <tr>
                    <td valign="top" width="60px">
                      <img src="https://i.ibb.co/XLzmWXB/icons-brand-controlled-data-3x.png" class="app-tbl-icon"/>
                    </td>
                    <td>
                      <table width="100%">
                        <tr>
                          <td class="app-tbl-lable">
                            Application #:
                          </td>
                          <td class="app-tbl-val">
                            ${app.appId}
                          </td>
                        </tr>

                        <tr>
                          <td class="app-tbl-lable">
                            Applicant:
                          </td>
                          <td class="app-tbl-val">
                            ${applicantName}
                          </td>
                        </tr>

                        <tr>
                          <td class="app-tbl-lable">
                            Instituion:
                          </td>
                          <td class="app-tbl-val">
                            ${applicantInfo.primaryAffiliation}
                          </td>
                        </tr>

                        <tr>
                          <td class="app-tbl-lable">
                            Submitted on:
                          </td>
                          <td class="app-tbl-val">
                            ${app.submittedAtUtc}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
        </mj-table>
      </mj-column>
    </mj-section>
  `;
}

function closure() {
  return `
    <mj-section padding="0">
      <mj-column padding="0">
        ${text(
          `If you have any questions, please consult the <a href="https://docs.icgc-argo.org/docs/data-access/data-access">Help Guides for Accessing Controlled Data</a> or <a href="https://platform.icgc-argo.org/contact">contact the ICGC DACO team</a>.`
          , { ...defaultTextStyle,  padding: '20px 0px 0px 0px' })
        }
        ${text(
          `Thank you for your interest in the International Cancer Genome Consortium.`,
          { ...defaultTextStyle,  padding: '20px 0px 0px 0px' })

        }
        ${text(
          `Sincerely, <br />
          The <a href="">ICGC DACO</a> Team`, { ...defaultTextStyle,  padding: '20px 0px 0px 0px' }
          )
        }
      </mj-column>
    </mj-section>
  `;
}

function footer() {
  return `
    <mj-wrapper full-width="full-width">
      <mj-section padding-top="0">
        <mj-group>
          <mj-column width="100%" padding-right="0">
            <mj-text font-size="11px" align="center" line-height="16px" font-weight="bold">
              <a class="footer-link" href="https://platform.icgc-argo.org/contact">Contact Us</a>&#xA0;&#xA0;&#xA0;&#xA0;&#xA0;&#xA0;&#xA0;&#xA0;<a class="footer-link" href="https://www.icgc-argo.org/page/72/introduction-and-goals-">Policies & Guidelines</a>&#xA0;&#xA0;&#xA0;&#xA0;&#xA0;&#xA0;&#xA0;&#xA0;<a class="footer-link" href="https://docs.icgc-argo.org/docs/data-access/data-access">Help Guides</a>&#xA0;&#xA0;&#xA0;&#xA0;&#xA0;&#xA0;&#xA0;&#xA0;<a class="footer-link" href="https://www.icgc-argo.org">Controlled Data Users</a>
            </mj-text>
            <mj-text font-size="11px" align="center" line-height="16px" font-weight="bold">
              <a class="footer-link" href="https://www.icgc-argo.org/">ICGC ARGO Website</a>&#xA0;&#xA0;&#xA0;&#xA0;&#xA0;&#xA0;&#xA0;&#xA0;<a class="footer-link" href="https://platform.icgc-argo.org/">ARGO Data Platform</a>
            </mj-text>
          </mj-column>
        </mj-group>
      </mj-section>
        <mj-section>
        <mj-column width="100%" padding="0">
          <mj-text color="#000000" font-size="11px" font-weight="bold" align="center">
            © 2021 ICGC Data Access Compliance Office. All rights reserved.
          </mj-text>
        </mj-column>
      </mj-section>
    </mj-wrapper>
  `;
}

export function action(text: string, buttonText: string, buttonLink: string) {
  return `
      <mj-section width="75%" padding="0 15px 0 10px" background-color="F6F6F7" border="1px solid #DCDDE1" align="center">
      <mj-column width="50%">
          <mj-text color="#0774D3" font-size="12px" font-weight="bold">
            ${text}
          </mj-text>
      </mj-column>
      <mj-column width="50%">
          <mj-button background-color="#7F55CC" text-transform="uppercase" align="center" color="#ffffff" font-size="13px" font-weight="bold" href="${buttonLink}" width="230px" height="30px" padding-top="15px">
            ${buttonText}
          </mj-button>
    </mj-column>
    </mj-section>
  `;
}

export function actionGetStarted(text: string, buttonText: string, buttonLink: string) {
  return `
  <mj-section padding="13px 0 13px 0" background-color="#F6F6F7" border="1px solid #DCDDE1">
    <mj-column width="20%" padding="13px 0px 13px 18px">
      <mj-text color="#0774D3"
              align="center"
              padding="0px 0px 0px 0px"
              font-size="14px"
              font-weight="bold">
        ${text}
      </mj-text>
    </mj-column>
    <mj-column width="50%" padding="0px 0px 0px 0px">
      <mj-button background-color="#7F55CC"
                text-transform="uppercase"
                color="#ffffff"
                font-size="12px"
                font-weight="bold"
                font-style="normal"
                href="${buttonLink}"
                border-radius="0px"
                inner-padding="16px 24px"
                padding="0px 0px 0px 0px">
        ${buttonText}
      </mj-button>
    </mj-column>
  </mj-section>
  `;
}

export function text(content: string, style: any = defaultTextStyle) {
  return `
    <mj-text ${Object.keys(style).map((k: string) => `${k}="${style[k]}"`).join(' ')}>
      ${content}
    </mj-text>
  `;
}

export function textParagraphSection(content: string,
                                     style: object = defaultTextStyle,
                                     padding: string = '0') {
  return `
    <mj-section padding="${padding}">
      <mj-column padding="0">
        ${text(content, style)}
      </mj-column>
    </mj-section>
  `;
}