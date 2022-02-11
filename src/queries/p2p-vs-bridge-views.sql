SELECT appenv, isp2p,
    COUNT(sentpacketslostpct) AS count_samples,
    AVG(sentpacketslostpct) AS avg_sentpacketslostpct,
    AVG(receivedpacketslostpct) AS avg_receivedpacketslostpct,
    AVG(meanrtt) AS avg_meanrtt
FROM rtcstats_pc_metrics
INNER JOIN rtcstats ON rtcstats.statssessionid = rtcstats_pc_metrics.statssessionid
WHERE sessionduration >= 10000
    AND sentpacketslostpct > 0
    AND sentpacketslostpct < 100
    AND receivedpacketslostpct > 0
    AND receivedpacketslostpct < 100
GROUP BY isp2p, appenv
