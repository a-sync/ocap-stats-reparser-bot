'use strict';
const puppeteer = require('puppeteer-core');

const HOST = 'https://fnf-stats.devs.space';//http://localhost
const LOGIN_TOKEN = '/login/puppeteer/e69b75cb143e5406dadf96ea6f674346258584d3afaf9f70e3de798105de8cc2';

const START_OP_ID = 246;
const END_OP_ID = 529;

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        // channel: 'chrome-canary',
        executablePath: 'C:\\Users\\Smith\\AppData\\Local\\Google\\Chrome SxS\\Application\\chrome.exe',
        userDataDir: './userData',
        defaultViewport: null
    });
    const page = await browser.newPage();

    page.on('console', consoleObj => {
        if (consoleObj.type() === 'error') {
            console.error('CON:ERROR ' + consoleObj.text());
        }
    })

    console.log('Login...');
    let login_res = await page.goto(HOST + LOGIN_TOKEN);
    //console.log('login_res.status()', login_res.status());
    if (login_res.status() !== 200) throw new Error('Login failed');

    if (await page.$('#id-' + START_OP_ID) === null) throw new Error('START OP ID not found!');
    if (await page.$('#id-' + END_OP_ID) === null) throw new Error('END OP ID not found!');

    const id_list = await page.evaluate((conf) => {
        const ids = [];
        const rows = document.querySelectorAll('tr.mdc-data-table__row');

        for (const r of rows) {
            const cells = r.getElementsByTagName('td');
            const id = Number(cells[0].textContent);

            if (id >= conf.START_OP_ID && id <= conf.END_OP_ID
                && cells[5].getElementsByTagName('input').length === 0
                && cells[5].textContent.trim() !== 'ignored') {
                ids.push(id);
            }
        }

        return ids.reverse();
    }, { START_OP_ID, END_OP_ID });
    //console.log(JSON.stringify(id_list));

    let c = 0;
    for (const op_id of id_list) {
        console.log('\n\nTask ' + (++c) + '. (op id: ' + op_id + ')', new Date().toUTCString());

        await page.goto(HOST + '/manage/' + op_id + '/verify');
        if ((await page.$('button[value=update]')) !== null) {
            //console.log('scrape data');

            const op_inputs = await page.evaluate(grabOpInputs);
            console.log('CURRENT INPUTS', op_inputs);

            await page.goto(HOST + '/manage/' + op_id);

            if ((await page.$('button[value=purge]')) !== null) {
                //console.log('purge op');
                await Promise.all([
                    page.click('button[value=purge]'),
                    page.waitForNavigation({ waitUntil: 'load', timeout: 0 })
                ]);
                console.log('PURGED OP');
            }

            if ((await page.$('button[value=parse]')) !== null) {
                await page.click('input[name=event][value=' + op_inputs.event + ']');

                console.log('start parsing', new Date().toUTCString());
                await Promise.all([
                    page.click('button[value=parse]'),
                    page.waitForNavigation({ waitUntil: 'load', timeout: 0 })
                ]);

                await page.goto(HOST + '/manage/' + op_id + '/verify');
                const default_inputs = await page.evaluate(grabOpInputs);
                //console.log('DEFAULT INPUTS', default_inputs);

                if (JSON.stringify(op_inputs) !== JSON.stringify(default_inputs)) {
                    console.log('UPDATE NEEDED');

                    if (op_inputs.start_time !== default_inputs.start_time) {
                        console.log('start_time:', default_inputs.start_time, '»', op_inputs.start_time);
                        await page.evaluate((starttm) => {
                            document.querySelector('input[name=start_time]').value = String(starttm);
                        }, op_inputs.start_time);
                    }

                    if (op_inputs.mission_author !== default_inputs.mission_author) {
                        console.log('mission_author:', default_inputs.mission_author, '»', op_inputs.mission_author);
                        await page.evaluate((athr) => {
                            document.querySelector('input[name=mission_author]').value = String(athr);
                        }, op_inputs.mission_author);
                    }

                    if (JSON.stringify(op_inputs.end_winner) !== JSON.stringify(default_inputs.end_winner)) {
                        console.log('end_winner:', default_inputs.end_winner, '»', op_inputs.end_winner);
                        await page.evaluate((wnnrs) => {
                            const wboxes = document.querySelectorAll(`input[name='end_winner[]']`);
                            for (const cb of wboxes) {
                                if (wnnrs.includes(cb.value)) cb.checked = true;
                                else cb.checked = false;
                            }
                        }, op_inputs.end_winner);
                    }

                    if (op_inputs.end_message !== default_inputs.end_message) {
                        console.log('end_message:', default_inputs.end_message, '»', op_inputs.end_message);
                        await page.evaluate((endmsg) => {
                            document.querySelector('input[name=end_message]').value = String(endmsg);
                        }, op_inputs.end_message);
                    }

                    if (op_inputs.verified !== default_inputs.verified) {
                        console.log('verified:', default_inputs.verified, '»', op_inputs.verified);
                        await page.evaluate((vrfd) => {
                            document.querySelector('input[name=verified]').checked = Boolean(vrfd);
                        }, op_inputs.verified);
                    }

                    if (JSON.stringify(op_inputs.cmd) !== JSON.stringify(default_inputs.cmd)) {
                        console.log('commanders:', default_inputs.cmd, '»', op_inputs.cmd);
                        await page.evaluate((cmdrs) => {
                            for (const side of Object.keys(cmdrs)) {
                                if (cmdrs[side] !== null) {
                                    const select = document.querySelector(`select[name='cmd[${side}]']`);
                                    if (select) {
                                        const opt = select.querySelector(`option[value='${cmdrs[side]}']`);
                                        if (opt) {
                                            opt.selected = true;
                                        } else {
                                            console.error('err: failed to find commander option');
                                        }
                                    } else {
                                        console.error('err: failed to find commander select');
                                    }
                                }
                            }
                        }, op_inputs.cmd);
                    }

                    //console.log('save verified data');
                    await Promise.all([
                        page.click('button[value=update]'),
                        page.waitForNavigation({ waitUntil: 'load' })
                    ]);
                } else {
                    console.log('nothing to update');
                }
            } else {
                console.error('err: op is already parsed');
            }
        } else {
            console.error('err: op is not parsed');
        }
    }

    await browser.close();
})();

function grabOpInputs() {
    const re = {};
    re.start_time = document.querySelector('input[name=start_time]').value;
    re.event = document.querySelector('input[name=event]:checked').value;
    re.mission_author = document.querySelector('input[name=mission_author]').value;
    re.end_winner = [...document.querySelectorAll(`input[name='end_winner[]']:checked`)].map(i => i.value);
    re.end_message = document.querySelector('input[name=end_message]').value;
    re.verified = document.querySelector('input[name=verified]').checked;

    re.cmd = {
        WEST: null,
        EAST: null,
        GUER: null,
        CIV: null,
        UNKNOWN: null
    }

    for (const side of Object.keys(re.cmd)) {
        const select = document.querySelector(`select[name='cmd[${side}]']`);
        if (select) {
            re.cmd[side] = select.value;
        }
    }

    return re;
}
