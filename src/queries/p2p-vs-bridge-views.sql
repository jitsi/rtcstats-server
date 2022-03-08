SELECT appenv, isp2p, usesrelay,
	COUNT(sentpacketslostpct) AS samples_count,
    AVG(sentpacketslostpct) AS sentpacketslostpct_avg,
    AVG(receivedpacketslostpct) AS receivedpacketslostpct_avg,
    AVG(meanrtt) AS meanrtt_avg,
    AVG(meanupperboundframeheight) AS meanupperboundframeheight_avg,
    AVG(meanupperboundframespersecond) AS meanupperboundframespersecond_avg
FROM rtcstats_pc_metrics
INNER JOIN rtcstats ON rtcstats.statssessionid = rtcstats_pc_metrics.statssessionid
WHERE sessionduration >= 10000
	AND sentpacketslostpct > 0
    AND sentpacketslostpct < 100
    AND receivedpacketslostpct > 0
    AND receivedpacketslostpct < 100
    AND isp2p IS NOT NULL -- filters out callstats peer connections
    AND rtcstats_pc_metrics.createdate BETWEEN DATEADD(DAY,-3,GETDATE()) AND GETDATE() -- change this to something sensible or remove
GROUP BY isp2p, appenv, usesrelay
